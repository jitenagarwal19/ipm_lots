"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseAliases = parseAliases;
exports.logComplianceChange = logComplianceChange;
exports.matchCsvMolecule = matchCsvMolecule;
const express_1 = require("express");
const client_1 = require("@prisma/client");
const multer_1 = __importDefault(require("multer"));
const sync_1 = require("csv-parse/sync");
const compliance_1 = require("../services/compliance");
const router = (0, express_1.Router)();
const prisma = new client_1.PrismaClient();
const upload = (0, multer_1.default)({ storage: multer_1.default.memoryStorage() });
const COMPLIANCE_UNIT = 'mg/kg';
function requiredString(value, field) {
    if (typeof value !== 'string' || !value.trim()) {
        throw new Error(`${field} is required.`);
    }
    return value.trim();
}
function optionalString(value) {
    if (typeof value !== 'string')
        return null;
    const trimmed = value.trim();
    return trimmed.length ? trimmed : null;
}
function numberValue(value, field) {
    const n = typeof value === 'number' ? value : Number(String(value !== null && value !== void 0 ? value : '').trim());
    if (!Number.isFinite(n)) {
        throw new Error(`${field} must be a number.`);
    }
    return n;
}
function boolValue(value, fallback = true) {
    if (typeof value === 'boolean')
        return value;
    if (typeof value !== 'string' || !value.trim())
        return fallback;
    const v = value.trim().toLowerCase();
    if (['true', 'yes', '1'].includes(v))
        return true;
    if (['false', 'no', '0'].includes(v))
        return false;
    return fallback;
}
function jsonSnapshot(value) {
    if (value === undefined)
        return null;
    return JSON.stringify(value);
}
function isMgKg(value) {
    const unit = optionalString(value) || COMPLIANCE_UNIT;
    return unit.toLowerCase() === COMPLIANCE_UNIT;
}
function parseAliases(value) {
    if (typeof value !== 'string')
        return [];
    return value
        .split(/[;|,]/)
        .map((alias) => alias.trim())
        .filter(Boolean);
}
function logComplianceChange(client, profileId, action, message, beforeValue, afterValue) {
    return __awaiter(this, void 0, void 0, function* () {
        return client.complianceChangeLog.create({
            data: {
                profile_id: profileId,
                action,
                message,
                before_json: jsonSnapshot(beforeValue),
                after_json: jsonSnapshot(afterValue),
                actor: 'settings_ui',
            },
        });
    });
}
function includeComplianceProfile() {
    return {
        product: true,
        standard: true,
        limits: {
            orderBy: { updatedAt: 'desc' },
            include: { molecule: { include: { aliases: { orderBy: { alias: 'asc' } } } } },
        },
    };
}
function getComplianceProfileView(profileId) {
    return __awaiter(this, void 0, void 0, function* () {
        const [profile, logs] = yield Promise.all([
            prisma.complianceProfile.findUnique({
                where: { id: profileId },
                include: includeComplianceProfile(),
            }),
            prisma.complianceChangeLog.findMany({
                where: { profile_id: profileId },
                orderBy: { createdAt: 'desc' },
                take: 50,
            }),
        ]);
        return profile ? Object.assign(Object.assign({}, profile), { logs }) : null;
    });
}
function findComplianceProfile(productId, standardId) {
    return __awaiter(this, void 0, void 0, function* () {
        return prisma.complianceProfile.findFirst({
            where: { product_id: productId, standard_id: standardId },
            include: includeComplianceProfile(),
        });
    });
}
function ensureProfileForLegacyLimit(client, standardId, productId) {
    return __awaiter(this, void 0, void 0, function* () {
        if (!productId)
            return null;
        const standard = yield client.complianceStandard.findUnique({ where: { id: standardId } });
        if (!standard)
            return null;
        return client.complianceProfile.upsert({
            where: {
                product_id_standard_id: {
                    product_id: productId,
                    standard_id: standardId,
                },
            },
            update: {},
            create: {
                product_id: productId,
                standard_id: standardId,
                fallback_limit: standard.fallback_limit,
                fallback_unit: COMPLIANCE_UNIT,
            },
        });
    });
}
function backfillComplianceProfiles(client) {
    return __awaiter(this, void 0, void 0, function* () {
        const legacyLimits = yield client.complianceLimit.findMany({
            where: {
                product_id: { not: null },
                profile_id: null,
            },
            include: { product: true, standard: true },
        });
        const seen = new Set();
        for (const limit of legacyLimits) {
            if (!limit.product_id)
                continue;
            const key = `${limit.product_id}:${limit.standard_id}`;
            if (seen.has(key))
                continue;
            seen.add(key);
            const existing = yield client.complianceProfile.findFirst({
                where: { product_id: limit.product_id, standard_id: limit.standard_id },
            });
            const profile = existing || (yield client.complianceProfile.create({
                data: {
                    product_id: limit.product_id,
                    standard_id: limit.standard_id,
                    fallback_limit: limit.standard.fallback_limit,
                    fallback_unit: COMPLIANCE_UNIT,
                },
            }));
            yield client.complianceLimit.updateMany({
                where: {
                    product_id: limit.product_id,
                    standard_id: limit.standard_id,
                    profile_id: null,
                },
                data: { profile_id: profile.id, unit: COMPLIANCE_UNIT },
            });
            if (!existing) {
                yield logComplianceChange(client, profile.id, 'PROFILE_BACKFILLED', `Created compliance profile from existing limits for ${limit.product.name} + ${limit.standard.name}.`, null, {
                    product_id: limit.product_id,
                    standard_id: limit.standard_id,
                });
            }
        }
    });
}
function upsertProfileLimit(client, input) {
    return __awaiter(this, void 0, void 0, function* () {
        const profile = yield client.complianceProfile.findUnique({
            where: { id: input.profile_id },
            include: { standard: true, product: true },
        });
        if (!profile)
            throw new Error('Compliance profile not found.');
        const existing = yield client.complianceLimit.findFirst({
            where: { profile_id: profile.id, molecule_id: input.molecule_id },
            include: { molecule: true },
        });
        if (existing) {
            return client.complianceLimit.update({
                where: { id: existing.id },
                data: {
                    standard_id: profile.standard_id,
                    product_id: profile.product_id,
                    limit_value: input.limit_value,
                    unit: COMPLIANCE_UNIT,
                    notes: input.notes,
                },
                include: { standard: true, molecule: true, product: true },
            });
        }
        return client.complianceLimit.create({
            data: {
                profile_id: profile.id,
                standard_id: profile.standard_id,
                product_id: profile.product_id,
                molecule_id: input.molecule_id,
                limit_value: input.limit_value,
                unit: COMPLIANCE_UNIT,
                notes: input.notes,
            },
            include: { standard: true, molecule: true, product: true },
        });
    });
}
function matchCsvMolecule(client, row) {
    return __awaiter(this, void 0, void 0, function* () {
        const rawName = requiredString(row.molecule_name || row.molecule, 'molecule_name');
        const casNumber = optionalString(row.cas_number || row.cas);
        if (casNumber) {
            const molecule = yield client.molecule.findFirst({
                where: { cas_number: casNumber },
                include: { aliases: { orderBy: { alias: 'asc' } } },
            });
            if (molecule)
                return { molecule, match_type: 'CAS', confidence: 'high' };
        }
        const normalized = (0, compliance_1.normalizeMoleculeName)(rawName);
        const byName = yield client.molecule.findUnique({
            where: { normalized_name: normalized },
            include: { aliases: { orderBy: { alias: 'asc' } } },
        });
        if (byName)
            return { molecule: byName, match_type: 'NAME', confidence: 'high' };
        const alias = yield client.moleculeAlias.findUnique({
            where: { normalized_alias: normalized },
            include: { molecule: { include: { aliases: { orderBy: { alias: 'asc' } } } } },
        });
        if (alias === null || alias === void 0 ? void 0 : alias.molecule)
            return { molecule: alias.molecule, match_type: 'ALIAS', confidence: 'medium' };
        return { molecule: null, match_type: 'NEW', confidence: 'none' };
    });
}
// Labs
router.get('/labs', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const labs = yield prisma.lab.findMany({
        include: { contacts: true },
    });
    res.json(labs);
}));
router.post('/labs', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { name, is_active, contacts } = req.body;
    if (contacts && contacts.length > 0) {
        const emails = contacts.map((c) => c.email.trim().toLowerCase());
        const uniqueEmails = new Set(emails);
        if (uniqueEmails.size !== emails.length) {
            return res.status(400).json({ error: "Duplicate email addresses are not allowed." });
        }
    }
    try {
        const cleanContacts = (contacts || []).map((c) => ({
            contact_name: c.contact_name,
            email: c.email,
            is_primary: c.is_primary || false
        }));
        const lab = yield prisma.lab.create({
            data: {
                name,
                is_active,
                contacts: { create: cleanContacts }
            },
            include: { contacts: true }
        });
        res.json(lab);
    }
    catch (error) {
        console.error("POST /labs error:", error);
        res.status(500).json({ error: "Failed to create lab" });
    }
}));
router.put('/labs/:id', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { id } = req.params;
    const { name, is_active, contacts } = req.body;
    if (contacts && contacts.length > 0) {
        const emails = contacts.map((c) => c.email.trim().toLowerCase());
        const uniqueEmails = new Set(emails);
        if (uniqueEmails.size !== emails.length) {
            return res.status(400).json({ error: "Duplicate email addresses are not allowed." });
        }
    }
    try {
        const cleanContacts = (contacts || []).map((c) => ({
            contact_name: c.contact_name,
            email: c.email,
            is_primary: c.is_primary || false
        }));
        // Delete old contacts and create new ones
        yield prisma.labContact.deleteMany({ where: { lab_id: id } });
        const lab = yield prisma.lab.update({
            where: { id },
            data: {
                name,
                is_active,
                contacts: { create: cleanContacts }
            },
            include: { contacts: true }
        });
        res.json(lab);
    }
    catch (error) {
        console.error("PUT /labs/:id error:", error);
        res.status(500).json({ error: "Failed to update lab" });
    }
}));
// Products
router.get('/products', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const products = yield prisma.product.findMany();
    res.json(products);
}));
router.post('/products', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const product = yield prisma.product.create({ data: { name: req.body.name } });
    res.json(product);
}));
router.put('/products/:id', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const product = yield prisma.product.update({ where: { id: req.params.id }, data: { name: req.body.name } });
    res.json(product);
}));
// Companies
router.get('/companies', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const companies = yield prisma.company.findMany();
    res.json(companies);
}));
router.post('/companies', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const company = yield prisma.company.create({ data: { name: req.body.name } });
    res.json(company);
}));
router.put('/companies/:id', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const company = yield prisma.company.update({ where: { id: req.params.id }, data: { name: req.body.name } });
    res.json(company);
}));
// Vendors
router.get('/vendors', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const vendors = yield prisma.vendor.findMany({ orderBy: { name: 'asc' } });
    res.json(vendors);
}));
router.post('/vendors', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const vendor = yield prisma.vendor.create({ data: { name: req.body.name } });
    res.json(vendor);
}));
router.put('/vendors/:id', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const vendor = yield prisma.vendor.update({ where: { id: req.params.id }, data: { name: req.body.name } });
    res.json(vendor);
}));
// Staff (sampling)
router.get('/staff', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const staff = yield prisma.staff.findMany({ orderBy: { name: 'asc' } });
    res.json(staff);
}));
router.post('/staff', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const member = yield prisma.staff.create({ data: { name: req.body.name } });
    res.json(member);
}));
router.put('/staff/:id', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const member = yield prisma.staff.update({ where: { id: req.params.id }, data: { name: req.body.name } });
    res.json(member);
}));
// Test Types
router.get('/test-types', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const testTypes = yield prisma.testType.findMany();
    res.json(testTypes);
}));
router.post('/test-types', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const testType = yield prisma.testType.create({ data: { name: req.body.name, country_standard: req.body.country_standard } });
    res.json(testType);
}));
router.put('/test-types/:id', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const testType = yield prisma.testType.update({ where: { id: req.params.id }, data: { name: req.body.name, country_standard: req.body.country_standard } });
    res.json(testType);
}));
// Variants
router.get('/variants', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const variants = yield prisma.variant.findMany();
    res.json(variants);
}));
router.post('/variants', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const variant = yield prisma.variant.create({ data: { name: req.body.name } });
    res.json(variant);
}));
router.put('/variants/:id', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const variant = yield prisma.variant.update({ where: { id: req.params.id }, data: { name: req.body.name } });
    res.json(variant);
}));
// Molecules
router.get('/molecules', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const molecules = yield prisma.molecule.findMany({
        orderBy: { name: 'asc' },
        include: { aliases: { orderBy: { alias: 'asc' } } },
    });
    res.json(molecules);
}));
router.post('/molecules', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const name = requiredString(req.body.name, 'name');
        const molecule = yield prisma.molecule.upsert({
            where: { normalized_name: (0, compliance_1.normalizeMoleculeName)(name) },
            update: {
                name,
                cas_number: optionalString(req.body.cas_number) || undefined,
                is_active: boolValue(req.body.is_active, true),
            },
            create: {
                name,
                normalized_name: (0, compliance_1.normalizeMoleculeName)(name),
                cas_number: optionalString(req.body.cas_number),
                is_active: boolValue(req.body.is_active, true),
            },
            include: { aliases: true },
        });
        res.json(molecule);
    }
    catch (error) {
        res.status(400).json({ error: error.message });
    }
}));
router.put('/molecules/:id', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const name = requiredString(req.body.name, 'name');
        const molecule = yield prisma.molecule.update({
            where: { id: req.params.id },
            data: {
                name,
                normalized_name: (0, compliance_1.normalizeMoleculeName)(name),
                cas_number: optionalString(req.body.cas_number),
                is_active: boolValue(req.body.is_active, true),
            },
            include: { aliases: true },
        });
        res.json(molecule);
    }
    catch (error) {
        res.status(400).json({ error: error.message });
    }
}));
// Molecule aliases
router.get('/molecule-aliases', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const aliases = yield prisma.moleculeAlias.findMany({
        orderBy: { alias: 'asc' },
        include: { molecule: true },
    });
    res.json(aliases);
}));
router.post('/molecule-aliases', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const alias = requiredString(req.body.alias, 'alias');
        const molecule_id = requiredString(req.body.molecule_id, 'molecule_id');
        const created = yield prisma.moleculeAlias.create({
            data: {
                molecule_id,
                alias,
                normalized_alias: (0, compliance_1.normalizeMoleculeName)(alias),
                source: optionalString(req.body.source),
            },
            include: { molecule: true },
        });
        res.json(created);
    }
    catch (error) {
        res.status(400).json({ error: error.message });
    }
}));
router.put('/molecule-aliases/:id', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const alias = requiredString(req.body.alias, 'alias');
        const updated = yield prisma.moleculeAlias.update({
            where: { id: req.params.id },
            data: {
                molecule_id: requiredString(req.body.molecule_id, 'molecule_id'),
                alias,
                normalized_alias: (0, compliance_1.normalizeMoleculeName)(alias),
                source: optionalString(req.body.source),
            },
            include: { molecule: true },
        });
        res.json(updated);
    }
    catch (error) {
        res.status(400).json({ error: error.message });
    }
}));
// Compliance profile workflow
router.get('/compliance/profiles', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        yield backfillComplianceProfiles(prisma);
        const productId = typeof req.query.product_id === 'string' ? req.query.product_id.trim() : '';
        const standardId = typeof req.query.standard_id === 'string' ? req.query.standard_id.trim() : '';
        if (productId && standardId) {
            const profile = yield findComplianceProfile(productId, standardId);
            const logs = profile
                ? yield prisma.complianceChangeLog.findMany({
                    where: { profile_id: profile.id },
                    orderBy: { createdAt: 'desc' },
                    take: 50,
                })
                : [];
            return res.json({ profile: profile ? Object.assign(Object.assign({}, profile), { logs }) : null });
        }
        const profiles = yield prisma.complianceProfile.findMany({
            orderBy: { updatedAt: 'desc' },
            include: {
                product: true,
                standard: true,
                _count: { select: { limits: true } },
            },
        });
        res.json({ profiles });
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
}));
router.post('/compliance/profiles', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const productId = requiredString(req.body.product_id, 'product_id');
        const standardId = requiredString(req.body.standard_id, 'standard_id');
        const fallbackLimit = req.body.fallback_limit === undefined || req.body.fallback_limit === ''
            ? 0.01
            : numberValue(req.body.fallback_limit, 'fallback_limit');
        const profile = yield prisma.$transaction((tx) => __awaiter(void 0, void 0, void 0, function* () {
            const existing = yield tx.complianceProfile.findFirst({
                where: { product_id: productId, standard_id: standardId },
                include: includeComplianceProfile(),
            });
            if (existing)
                return existing;
            const created = yield tx.complianceProfile.create({
                data: {
                    product_id: productId,
                    standard_id: standardId,
                    fallback_limit: fallbackLimit,
                    fallback_unit: COMPLIANCE_UNIT,
                },
                include: includeComplianceProfile(),
            });
            yield logComplianceChange(tx, created.id, 'PROFILE_CREATED', `Created compliance profile for ${created.product.name} + ${created.standard.name}.`, null, {
                fallback_limit: created.fallback_limit,
                fallback_unit: created.fallback_unit,
            });
            return created;
        }));
        const view = yield getComplianceProfileView(profile.id);
        res.json({ profile: view });
    }
    catch (error) {
        res.status(400).json({ error: error.message });
    }
}));
router.put('/compliance/profiles/:id/default', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const fallbackLimit = numberValue(req.body.fallback_limit, 'fallback_limit');
        if (!isMgKg(req.body.fallback_unit)) {
            return res.status(400).json({ error: 'Only mg/kg is supported for compliance defaults.' });
        }
        yield prisma.$transaction((tx) => __awaiter(void 0, void 0, void 0, function* () {
            const existing = yield tx.complianceProfile.findUnique({ where: { id: req.params.id } });
            if (!existing)
                throw new Error('Compliance profile not found.');
            const updated = yield tx.complianceProfile.update({
                where: { id: req.params.id },
                data: { fallback_limit: fallbackLimit, fallback_unit: COMPLIANCE_UNIT },
            });
            yield logComplianceChange(tx, existing.id, 'DEFAULT_UPDATED', `Updated default limit to ${fallbackLimit} ${COMPLIANCE_UNIT}.`, {
                fallback_limit: existing.fallback_limit,
                fallback_unit: existing.fallback_unit,
            }, {
                fallback_limit: updated.fallback_limit,
                fallback_unit: updated.fallback_unit,
            });
        }));
        res.json({ profile: yield getComplianceProfileView(req.params.id) });
    }
    catch (error) {
        const status = /not found/i.test(error.message) ? 404 : 400;
        res.status(status).json({ error: error.message });
    }
}));
router.post('/compliance/profiles/:id/limits', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        if (!isMgKg(req.body.unit)) {
            return res.status(400).json({ error: 'Only mg/kg is supported for compliance limits.' });
        }
        yield prisma.$transaction((tx) => __awaiter(void 0, void 0, void 0, function* () {
            const limit = yield upsertProfileLimit(tx, {
                profile_id: req.params.id,
                molecule_id: requiredString(req.body.molecule_id, 'molecule_id'),
                limit_value: numberValue(req.body.limit_value, 'limit_value'),
                notes: optionalString(req.body.notes),
            });
            yield logComplianceChange(tx, req.params.id, 'LIMIT_UPSERTED', `Saved ${limit.molecule.name} at ${limit.limit_value} ${COMPLIANCE_UNIT}.`, null, {
                molecule_id: limit.molecule_id,
                limit_value: limit.limit_value,
                unit: limit.unit,
            });
        }));
        res.json({ profile: yield getComplianceProfileView(req.params.id) });
    }
    catch (error) {
        const status = /not found/i.test(error.message) ? 404 : 400;
        res.status(status).json({ error: error.message });
    }
}));
router.put('/compliance/profiles/:id/limits/:limitId', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        if (!isMgKg(req.body.unit)) {
            return res.status(400).json({ error: 'Only mg/kg is supported for compliance limits.' });
        }
        yield prisma.$transaction((tx) => __awaiter(void 0, void 0, void 0, function* () {
            const existing = yield tx.complianceLimit.findFirst({
                where: { id: req.params.limitId, profile_id: req.params.id },
                include: { molecule: true },
            });
            if (!existing)
                throw new Error('Compliance limit not found.');
            const updated = yield tx.complianceLimit.update({
                where: { id: existing.id },
                data: {
                    molecule_id: requiredString(req.body.molecule_id, 'molecule_id'),
                    limit_value: numberValue(req.body.limit_value, 'limit_value'),
                    unit: COMPLIANCE_UNIT,
                    notes: optionalString(req.body.notes),
                },
                include: { molecule: true },
            });
            yield logComplianceChange(tx, req.params.id, 'LIMIT_UPDATED', `Updated ${updated.molecule.name} to ${updated.limit_value} ${COMPLIANCE_UNIT}.`, {
                molecule_id: existing.molecule_id,
                limit_value: existing.limit_value,
                unit: existing.unit,
                notes: existing.notes,
            }, {
                molecule_id: updated.molecule_id,
                limit_value: updated.limit_value,
                unit: updated.unit,
                notes: updated.notes,
            });
        }));
        res.json({ profile: yield getComplianceProfileView(req.params.id) });
    }
    catch (error) {
        const status = /not found/i.test(error.message) ? 404 : 400;
        res.status(status).json({ error: error.message });
    }
}));
router.post('/compliance/profiles/:id/import/preview', upload.single('file'), (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const profileId = String(req.params.id);
        const profile = yield prisma.complianceProfile.findUnique({ where: { id: profileId } });
        if (!profile)
            return res.status(404).json({ error: 'Compliance profile not found.' });
        if (!req.file)
            return res.status(400).json({ error: 'CSV file is required.' });
        const rows = (0, sync_1.parse)(req.file.buffer.toString('utf8'), {
            columns: true,
            skip_empty_lines: true,
            trim: true,
        });
        const previewRows = [];
        for (const [idx, row] of rows.entries()) {
            const errors = [];
            let limitValue = null;
            let moleculeName = row.molecule_name || row.molecule || '';
            const unit = optionalString(row.unit) || COMPLIANCE_UNIT;
            try {
                moleculeName = requiredString(moleculeName, 'molecule_name');
            }
            catch (error) {
                errors.push(error.message);
            }
            try {
                limitValue = numberValue(row.limit_value || row.limit || row.mrl, 'limit_value');
            }
            catch (error) {
                errors.push(error.message);
            }
            if (unit.toLowerCase() !== COMPLIANCE_UNIT) {
                errors.push(`Unsupported unit "${unit}". Use mg/kg.`);
            }
            let match = { molecule: null, match_type: 'NEW', confidence: 'none' };
            if (moleculeName.trim()) {
                try {
                    match = yield matchCsvMolecule(prisma, row);
                }
                catch (error) {
                    errors.push(error.message);
                }
            }
            previewRows.push({
                row_index: idx,
                row_number: idx + 2,
                molecule_name: moleculeName,
                cas_number: optionalString(row.cas_number || row.cas),
                aliases: parseAliases(row.aliases),
                limit_value: limitValue,
                unit: COMPLIANCE_UNIT,
                notes: optionalString(row.notes),
                matched_molecule: match.molecule,
                match_type: match.match_type,
                confidence: match.confidence,
                action: match.molecule ? 'use_existing' : 'create_new',
                errors,
            });
        }
        res.json({ rows: previewRows });
    }
    catch (error) {
        res.status(400).json({ error: error.message });
    }
}));
router.post('/compliance/profiles/:id/import/commit', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const rows = Array.isArray(req.body.rows) ? req.body.rows : [];
        if (rows.length === 0)
            return res.status(400).json({ error: 'At least one reviewed row is required.' });
        const result = yield prisma.$transaction((tx) => __awaiter(void 0, void 0, void 0, function* () {
            var _a;
            const profile = yield tx.complianceProfile.findUnique({ where: { id: req.params.id }, include: { product: true, standard: true } });
            if (!profile)
                throw new Error('Compliance profile not found.');
            let imported = 0;
            for (const row of rows) {
                const moleculeName = requiredString(row.molecule_name, 'molecule_name');
                const limitValue = numberValue(row.limit_value, 'limit_value');
                if (!isMgKg(row.unit))
                    throw new Error(`Only mg/kg is supported for ${moleculeName}.`);
                let molecule = null;
                const action = optionalString(row.action) || 'use_existing';
                if (action === 'create_new') {
                    molecule = yield tx.molecule.upsert({
                        where: { normalized_name: (0, compliance_1.normalizeMoleculeName)(moleculeName) },
                        update: { cas_number: optionalString(row.cas_number) || undefined },
                        create: {
                            name: moleculeName,
                            normalized_name: (0, compliance_1.normalizeMoleculeName)(moleculeName),
                            cas_number: optionalString(row.cas_number),
                        },
                    });
                }
                else {
                    const moleculeId = requiredString(row.molecule_id || ((_a = row.matched_molecule) === null || _a === void 0 ? void 0 : _a.id), 'molecule_id');
                    molecule = yield tx.molecule.findUnique({ where: { id: moleculeId } });
                    if (!molecule)
                        throw new Error(`Molecule not found for ${moleculeName}.`);
                }
                const aliases = new Set(parseAliases(row.aliases));
                if (action === 'map_existing' || (action === 'use_existing' && (0, compliance_1.normalizeMoleculeName)(moleculeName) !== molecule.normalized_name)) {
                    aliases.add(moleculeName);
                }
                for (const alias of aliases) {
                    yield tx.moleculeAlias.upsert({
                        where: { normalized_alias: (0, compliance_1.normalizeMoleculeName)(alias) },
                        update: { molecule_id: molecule.id, alias, source: 'compliance_csv' },
                        create: { molecule_id: molecule.id, alias, normalized_alias: (0, compliance_1.normalizeMoleculeName)(alias), source: 'compliance_csv' },
                    });
                }
                yield upsertProfileLimit(tx, {
                    profile_id: profile.id,
                    molecule_id: molecule.id,
                    limit_value: limitValue,
                    notes: optionalString(row.notes),
                });
                imported++;
            }
            yield logComplianceChange(tx, profile.id, 'CSV_IMPORTED', `Imported ${imported} molecule limit${imported === 1 ? '' : 's'} from CSV review.`, null, {
                imported,
            });
            return { imported };
        }));
        res.json(Object.assign(Object.assign({}, result), { profile: yield getComplianceProfileView(req.params.id) }));
    }
    catch (error) {
        const status = /not found/i.test(error.message) ? 404 : 400;
        res.status(status).json({ error: error.message });
    }
}));
router.get('/compliance/profiles/:id/logs', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const logs = yield prisma.complianceChangeLog.findMany({
            where: { profile_id: req.params.id },
            orderBy: { createdAt: 'desc' },
            take: 100,
        });
        res.json({ logs });
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
}));
// Compliance standards
router.get('/compliance-standards', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const standards = yield prisma.complianceStandard.findMany({ orderBy: { name: 'asc' } });
    res.json(standards);
}));
router.post('/compliance-standards', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const code = requiredString(req.body.code, 'code').toUpperCase();
        const name = requiredString(req.body.name, 'name');
        const fallbackLimit = req.body.fallback_limit === undefined || req.body.fallback_limit === ''
            ? 0.01
            : numberValue(req.body.fallback_limit, 'fallback_limit');
        const fallbackUnit = optionalString(req.body.fallback_unit) || 'mg/kg';
        const standard = yield prisma.complianceStandard.upsert({
            where: { code },
            update: {
                name,
                fallback_limit: fallbackLimit,
                fallback_unit: fallbackUnit,
                is_active: boolValue(req.body.is_active, true),
            },
            create: {
                name: requiredString(req.body.name, 'name'),
                code,
                fallback_limit: fallbackLimit,
                fallback_unit: fallbackUnit,
                is_active: boolValue(req.body.is_active, true),
            },
        });
        res.json(standard);
    }
    catch (error) {
        res.status(400).json({ error: error.message });
    }
}));
router.put('/compliance-standards/:id', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const standard = yield prisma.complianceStandard.update({
            where: { id: req.params.id },
            data: {
                code: requiredString(req.body.code, 'code').toUpperCase(),
                name: requiredString(req.body.name, 'name'),
                fallback_limit: numberValue(req.body.fallback_limit, 'fallback_limit'),
                fallback_unit: optionalString(req.body.fallback_unit) || 'mg/kg',
                is_active: boolValue(req.body.is_active, true),
            },
        });
        res.json(standard);
    }
    catch (error) {
        res.status(400).json({ error: error.message });
    }
}));
// Compliance limits
router.get('/compliance-limits', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const limits = yield prisma.complianceLimit.findMany({
        orderBy: [{ updatedAt: 'desc' }],
        include: { standard: true, molecule: true, product: true },
    });
    res.json(limits);
}));
function upsertComplianceLimit(input) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, _b;
        const profile = yield ensureProfileForLegacyLimit(prisma, input.standard_id, input.product_id);
        const existing = yield prisma.complianceLimit.findFirst({
            where: {
                standard_id: input.standard_id,
                molecule_id: input.molecule_id,
                product_id: input.product_id,
            },
        });
        if (existing) {
            return prisma.complianceLimit.update({
                where: { id: existing.id },
                data: {
                    profile_id: (_a = profile === null || profile === void 0 ? void 0 : profile.id) !== null && _a !== void 0 ? _a : existing.profile_id,
                    limit_value: input.limit_value,
                    unit: COMPLIANCE_UNIT,
                    notes: input.notes,
                },
                include: { standard: true, molecule: true, product: true },
            });
        }
        return prisma.complianceLimit.create({
            data: Object.assign(Object.assign({}, input), { profile_id: (_b = profile === null || profile === void 0 ? void 0 : profile.id) !== null && _b !== void 0 ? _b : null, unit: COMPLIANCE_UNIT }),
            include: { standard: true, molecule: true, product: true },
        });
    });
}
router.post('/compliance-limits', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const limit = yield upsertComplianceLimit({
            standard_id: requiredString(req.body.standard_id, 'standard_id'),
            molecule_id: requiredString(req.body.molecule_id, 'molecule_id'),
            product_id: optionalString(req.body.product_id),
            limit_value: numberValue(req.body.limit_value, 'limit_value'),
            unit: optionalString(req.body.unit) || 'mg/kg',
            notes: optionalString(req.body.notes),
        });
        res.json(limit);
    }
    catch (error) {
        res.status(400).json({ error: error.message });
    }
}));
router.put('/compliance-limits/:id', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b;
    try {
        const limit = yield prisma.complianceLimit.update({
            where: { id: req.params.id },
            data: {
                profile_id: (_b = (_a = (yield ensureProfileForLegacyLimit(prisma, requiredString(req.body.standard_id, 'standard_id'), optionalString(req.body.product_id)))) === null || _a === void 0 ? void 0 : _a.id) !== null && _b !== void 0 ? _b : null,
                standard_id: requiredString(req.body.standard_id, 'standard_id'),
                molecule_id: requiredString(req.body.molecule_id, 'molecule_id'),
                product_id: optionalString(req.body.product_id),
                limit_value: numberValue(req.body.limit_value, 'limit_value'),
                unit: COMPLIANCE_UNIT,
                notes: optionalString(req.body.notes),
            },
            include: { standard: true, molecule: true, product: true },
        });
        res.json(limit);
    }
    catch (error) {
        res.status(400).json({ error: error.message });
    }
}));
router.post('/compliance-limits/import', upload.single('file'), (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'CSV file is required.' });
        }
        const rows = (0, sync_1.parse)(req.file.buffer.toString('utf8'), {
            columns: true,
            skip_empty_lines: true,
            trim: true,
        });
        const errors = [];
        let imported = 0;
        for (const [idx, row] of rows.entries()) {
            try {
                const standardCode = requiredString(row.standard_code || row.standard, 'standard_code').toUpperCase();
                const standardName = optionalString(row.standard_name) || standardCode;
                const moleculeName = requiredString(row.molecule_name || row.molecule, 'molecule_name');
                const normalized = (0, compliance_1.normalizeMoleculeName)(moleculeName);
                const productName = optionalString(row.product_name || row.product);
                const standard = yield prisma.complianceStandard.upsert({
                    where: { code: standardCode },
                    update: {
                        name: standardName,
                        fallback_limit: optionalString(row.fallback_limit) ? numberValue(row.fallback_limit, 'fallback_limit') : undefined,
                        fallback_unit: optionalString(row.fallback_unit) || undefined,
                    },
                    create: {
                        code: standardCode,
                        name: standardName,
                        fallback_limit: optionalString(row.fallback_limit) ? numberValue(row.fallback_limit, 'fallback_limit') : 0.01,
                        fallback_unit: optionalString(row.fallback_unit) || optionalString(row.unit) || 'mg/kg',
                    },
                });
                const molecule = yield prisma.molecule.upsert({
                    where: { normalized_name: normalized },
                    update: { cas_number: optionalString(row.cas_number) || undefined },
                    create: {
                        name: moleculeName,
                        normalized_name: normalized,
                        cas_number: optionalString(row.cas_number),
                    },
                });
                for (const rawAlias of (row.aliases || '').split(/[;|]/)) {
                    const alias = rawAlias.trim();
                    if (!alias)
                        continue;
                    yield prisma.moleculeAlias.upsert({
                        where: { normalized_alias: (0, compliance_1.normalizeMoleculeName)(alias) },
                        update: { molecule_id: molecule.id, alias },
                        create: { molecule_id: molecule.id, alias, normalized_alias: (0, compliance_1.normalizeMoleculeName)(alias), source: 'csv_import' },
                    });
                }
                let product = null;
                if (productName) {
                    product = yield prisma.product.findFirst({ where: { name: productName } });
                    if (!product) {
                        product = yield prisma.product.create({ data: { name: productName } });
                    }
                }
                yield upsertComplianceLimit({
                    standard_id: standard.id,
                    molecule_id: molecule.id,
                    product_id: (_a = product === null || product === void 0 ? void 0 : product.id) !== null && _a !== void 0 ? _a : null,
                    limit_value: numberValue(row.limit_value || row.limit || row.mrl, 'limit_value'),
                    unit: optionalString(row.unit) || standard.fallback_unit || 'mg/kg',
                    notes: optionalString(row.notes),
                });
                imported++;
            }
            catch (error) {
                errors.push(`Row ${idx + 2}: ${error.message}`);
            }
        }
        res.json({ imported, errors });
    }
    catch (error) {
        res.status(400).json({ error: error.message });
    }
}));
// System Settings
router.get('/system', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const settings = yield prisma.systemSetting.findMany();
    const settingsMap = settings.reduce((acc, s) => {
        acc[s.key] = s.value;
        return acc;
    }, {});
    res.json(settingsMap);
}));
router.put('/system/:key', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { key } = req.params;
    const { value } = req.body;
    try {
        const setting = yield prisma.systemSetting.upsert({
            where: { key },
            update: { value },
            create: { key, value }
        });
        res.json(setting);
    }
    catch (error) {
        console.error(`PUT /system/${key} error:`, error);
        res.status(500).json({ error: "Failed to update setting" });
    }
}));
exports.default = router;
