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
Object.defineProperty(exports, "__esModule", { value: true });
exports.normalizeMoleculeName = normalizeMoleculeName;
exports.isDetectedMolecule = isDetectedMolecule;
exports.findOrCreateMoleculeForResult = findOrCreateMoleculeForResult;
exports.buildCompliancePreview = buildCompliancePreview;
exports.recordComplianceAgreement = recordComplianceAgreement;
const DEFAULT_FALLBACK_LIMIT = 0.01;
const DEFAULT_UNIT = 'mg/kg';
function normalizeMoleculeName(value) {
    return String(value || '')
        .normalize('NFKD')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, ' ')
        .trim()
        .replace(/\s+/g, ' ');
}
function parseNumber(value) {
    if (typeof value === 'number' && Number.isFinite(value))
        return value;
    if (typeof value !== 'string')
        return null;
    const match = value.replace(/,/g, '').match(/-?\d+(?:\.\d+)?/);
    if (!match)
        return null;
    const parsed = Number(match[0]);
    return Number.isFinite(parsed) ? parsed : null;
}
function isDetectedMolecule(molecule) {
    if ((molecule === null || molecule === void 0 ? void 0 : molecule.is_detected) === true)
        return true;
    if ((molecule === null || molecule === void 0 ? void 0 : molecule.is_detected) === false)
        return false;
    const combined = `${(molecule === null || molecule === void 0 ? void 0 : molecule.status) || ''} ${(molecule === null || molecule === void 0 ? void 0 : molecule.result) || ''}`.toLowerCase();
    if (combined.includes('not detected') || combined.includes('non detect') || /\bnd\b/.test(combined)) {
        return false;
    }
    return combined.includes('detected') || /\d/.test(combined);
}
function findMoleculeForResult(client, moleculeResult) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a;
        if (moleculeResult.molecule_id) {
            const linked = yield client.molecule.findUnique({ where: { id: moleculeResult.molecule_id } });
            if (linked)
                return linked;
        }
        const cas = typeof moleculeResult.cas_number === 'string' ? moleculeResult.cas_number.trim() : '';
        if (cas) {
            const byCas = yield client.molecule.findFirst({ where: { cas_number: cas } });
            if (byCas)
                return byCas;
        }
        const normalized = normalizeMoleculeName(moleculeResult.molecule_name);
        if (!normalized)
            return null;
        const byName = yield client.molecule.findUnique({ where: { normalized_name: normalized } });
        if (byName)
            return byName;
        const alias = yield client.moleculeAlias.findUnique({
            where: { normalized_alias: normalized },
            include: { molecule: true },
        });
        return (_a = alias === null || alias === void 0 ? void 0 : alias.molecule) !== null && _a !== void 0 ? _a : null;
    });
}
function findOrCreateMoleculeForResult(client, moleculeResult) {
    return __awaiter(this, void 0, void 0, function* () {
        const existing = yield findMoleculeForResult(client, moleculeResult);
        if (existing) {
            if (moleculeResult.molecule_id !== existing.id) {
                yield client.moleculeResult.update({
                    where: { id: moleculeResult.id },
                    data: { molecule_id: existing.id },
                });
            }
            return existing;
        }
        const displayName = String(moleculeResult.molecule_name || '').trim() || 'Unknown molecule';
        const normalized = normalizeMoleculeName(displayName);
        if (!normalized)
            return null;
        const molecule = yield client.molecule.upsert({
            where: { normalized_name: normalized },
            update: {
                cas_number: moleculeResult.cas_number || undefined,
            },
            create: {
                name: displayName,
                normalized_name: normalized,
                cas_number: moleculeResult.cas_number || null,
            },
        });
        yield client.moleculeAlias.upsert({
            where: { normalized_alias: normalized },
            update: { molecule_id: molecule.id, alias: displayName },
            create: { molecule_id: molecule.id, alias: displayName, normalized_alias: normalized, source: 'lab_result' },
        });
        yield client.moleculeResult.update({
            where: { id: moleculeResult.id },
            data: { molecule_id: molecule.id },
        });
        return molecule;
    });
}
function resolveLimit(client, standard, moleculeId, productId) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, _b;
        if (productId) {
            const profile = yield ((_b = (_a = client.complianceProfile) === null || _a === void 0 ? void 0 : _a.findFirst) === null || _b === void 0 ? void 0 : _b.call(_a, {
                where: { standard_id: standard.id, product_id: productId },
                include: { limits: true },
            }));
            if (profile) {
                if (moleculeId) {
                    const profileLimit = (profile.limits || []).find((limit) => limit.molecule_id === moleculeId);
                    if (profileLimit) {
                        return {
                            value: profileLimit.limit_value,
                            unit: profileLimit.unit,
                            source: 'PROFILE',
                            fallbackUsed: false,
                        };
                    }
                }
                return {
                    value: typeof profile.fallback_limit === 'number' ? profile.fallback_limit : DEFAULT_FALLBACK_LIMIT,
                    unit: profile.fallback_unit || DEFAULT_UNIT,
                    source: 'PROFILE_DEFAULT',
                    fallbackUsed: true,
                };
            }
        }
        if (moleculeId) {
            if (productId) {
                const productLimit = yield client.complianceLimit.findFirst({
                    where: { standard_id: standard.id, molecule_id: moleculeId, product_id: productId },
                });
                if (productLimit) {
                    return {
                        value: productLimit.limit_value,
                        unit: productLimit.unit,
                        source: 'PRODUCT',
                        fallbackUsed: false,
                    };
                }
            }
            const globalLimit = yield client.complianceLimit.findFirst({
                where: { standard_id: standard.id, molecule_id: moleculeId, product_id: null },
            });
            if (globalLimit) {
                return {
                    value: globalLimit.limit_value,
                    unit: globalLimit.unit,
                    source: 'STANDARD',
                    fallbackUsed: false,
                };
            }
        }
        return {
            value: typeof standard.fallback_limit === 'number' ? standard.fallback_limit : DEFAULT_FALLBACK_LIMIT,
            unit: standard.fallback_unit || DEFAULT_UNIT,
            source: 'FALLBACK',
            fallbackUsed: true,
        };
    });
}
function buildCompliancePreview(client, reportId, standardId) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, _b, _c, _d, _e, _f;
        const [report, standard] = yield Promise.all([
            client.labReport.findUnique({
                where: { id: reportId },
                include: {
                    test: { include: { lot: true } },
                    moleculeResults: { orderBy: { createdAt: 'asc' } },
                    complianceChecks: {
                        where: { standard_id: standardId },
                        include: { moleculeResults: true, standard: true },
                    },
                },
            }),
            client.complianceStandard.findUnique({ where: { id: standardId } }),
        ]);
        if (!report)
            throw new Error('Review report not found.');
        if (!standard)
            throw new Error('Compliance standard not found.');
        const productId = (_c = (_b = (_a = report.test) === null || _a === void 0 ? void 0 : _a.lot) === null || _b === void 0 ? void 0 : _b.product_id) !== null && _c !== void 0 ? _c : null;
        const detected = (report.moleculeResults || []).filter(isDetectedMolecule);
        const rows = [];
        for (const moleculeResult of detected) {
            const molecule = yield findOrCreateMoleculeForResult(client, moleculeResult);
            const limit = yield resolveLimit(client, standard, (_d = molecule === null || molecule === void 0 ? void 0 : molecule.id) !== null && _d !== void 0 ? _d : null, productId);
            const measuredValue = typeof moleculeResult.numeric_result === 'number'
                ? moleculeResult.numeric_result
                : parseNumber(moleculeResult.result);
            rows.push({
                moleculeResultId: moleculeResult.id,
                moleculeId: (_e = molecule === null || molecule === void 0 ? void 0 : molecule.id) !== null && _e !== void 0 ? _e : null,
                moleculeName: moleculeResult.molecule_name,
                casNumber: moleculeResult.cas_number,
                result: moleculeResult.result,
                measuredValue,
                measuredUnit: moleculeResult.unit,
                limitValue: limit.value,
                limitUnit: limit.unit,
                limitSource: limit.source,
                fallbackUsed: limit.fallbackUsed,
                isDetected: true,
                isCompliant: measuredValue === null ? null : measuredValue <= limit.value,
            });
        }
        return {
            reportId: report.id,
            standard,
            existingCheck: (_f = report.complianceChecks[0]) !== null && _f !== void 0 ? _f : null,
            rows,
        };
    });
}
function recordComplianceAgreement(client, reportId, standardId, notes) {
    return __awaiter(this, void 0, void 0, function* () {
        return client.$transaction((tx) => __awaiter(this, void 0, void 0, function* () {
            const preview = yield buildCompliancePreview(tx, reportId, standardId);
            const now = new Date();
            const check = yield tx.labReportComplianceCheck.upsert({
                where: {
                    lab_report_id_standard_id: {
                        lab_report_id: reportId,
                        standard_id: standardId,
                    },
                },
                update: {
                    status: 'COMPLIANT',
                    is_compliant: true,
                    notes,
                    checked_at: now,
                },
                create: {
                    lab_report_id: reportId,
                    standard_id: standardId,
                    status: 'COMPLIANT',
                    is_compliant: true,
                    notes,
                    checked_at: now,
                },
            });
            yield tx.labReportComplianceMoleculeResult.deleteMany({
                where: { compliance_check_id: check.id },
            });
            if (preview.rows.length > 0) {
                yield tx.labReportComplianceMoleculeResult.createMany({
                    data: preview.rows.map((row) => ({
                        compliance_check_id: check.id,
                        molecule_result_id: row.moleculeResultId,
                        molecule_id: row.moleculeId,
                        measured_value: row.measuredValue,
                        measured_unit: row.measuredUnit,
                        limit_value: row.limitValue,
                        limit_unit: row.limitUnit,
                        limit_source: row.limitSource,
                        fallback_used: row.fallbackUsed,
                        is_detected: row.isDetected,
                        is_compliant: row.isCompliant,
                    })),
                });
            }
            return tx.labReportComplianceCheck.findUnique({
                where: { id: check.id },
                include: {
                    standard: true,
                    moleculeResults: {
                        include: {
                            moleculeResult: true,
                            molecule: true,
                        },
                    },
                },
            });
        }));
    });
}
