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
const express_1 = require("express");
const client_1 = require("@prisma/client");
const router = (0, express_1.Router)();
const prisma = new client_1.PrismaClient();
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
