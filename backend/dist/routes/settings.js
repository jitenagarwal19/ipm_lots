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
const express_1 = require("express");
const client_1 = require("@prisma/client");
const multer_1 = __importDefault(require("multer"));
const sync_1 = require("csv-parse/sync");
const compliance_1 = require("../services/compliance");
const router = (0, express_1.Router)();
const prisma = new client_1.PrismaClient();
const upload = (0, multer_1.default)({ storage: multer_1.default.memoryStorage() });
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
        const molecule = yield prisma.molecule.create({
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
// Compliance standards
router.get('/compliance-standards', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const standards = yield prisma.complianceStandard.findMany({ orderBy: { name: 'asc' } });
    res.json(standards);
}));
router.post('/compliance-standards', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const code = requiredString(req.body.code, 'code').toUpperCase();
        const standard = yield prisma.complianceStandard.create({
            data: {
                code,
                name: requiredString(req.body.name, 'name'),
                fallback_limit: req.body.fallback_limit === undefined || req.body.fallback_limit === ''
                    ? 0.01
                    : numberValue(req.body.fallback_limit, 'fallback_limit'),
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
                    limit_value: input.limit_value,
                    unit: input.unit,
                    notes: input.notes,
                },
                include: { standard: true, molecule: true, product: true },
            });
        }
        return prisma.complianceLimit.create({
            data: input,
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
    try {
        const limit = yield prisma.complianceLimit.update({
            where: { id: req.params.id },
            data: {
                standard_id: requiredString(req.body.standard_id, 'standard_id'),
                molecule_id: requiredString(req.body.molecule_id, 'molecule_id'),
                product_id: optionalString(req.body.product_id),
                limit_value: numberValue(req.body.limit_value, 'limit_value'),
                unit: optionalString(req.body.unit) || 'mg/kg',
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
