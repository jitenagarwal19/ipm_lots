-- CreateTable
CREATE TABLE "Lab" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Lab_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LabContact" (
    "id" TEXT NOT NULL,
    "lab_id" TEXT NOT NULL,
    "contact_name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "is_primary" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LabContact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Product" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Variant" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Variant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Company" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Company_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Vendor" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Vendor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Staff" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Staff_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TestType" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "country_standard" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TestType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Lot" (
    "id" TEXT NOT NULL,
    "lot_number" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "variant_id" TEXT,
    "company_id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Lot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Test" (
    "id" TEXT NOT NULL,
    "lot_id" TEXT NOT NULL,
    "lab_id" TEXT NOT NULL,
    "test_type_id" TEXT NOT NULL,
    "vendor_id" TEXT,
    "region" TEXT,
    "sampled_by_staff_id" TEXT,
    "status" TEXT NOT NULL DEFAULT 'INITIATED',
    "email_thread_id" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Test_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Email" (
    "id" TEXT NOT NULL,
    "message_id" TEXT NOT NULL,
    "thread_id" TEXT,
    "subject" TEXT,
    "body" TEXT,
    "from_email" TEXT NOT NULL,
    "to_email" TEXT,
    "direction" TEXT NOT NULL DEFAULT 'RECEIVED',
    "received_at" TIMESTAMP(3) NOT NULL,
    "test_id" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Email_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Attachment" (
    "id" TEXT NOT NULL,
    "email_id" TEXT NOT NULL,
    "original_filename" TEXT,
    "file_url" TEXT NOT NULL,
    "file_type" TEXT,
    "extracted_text" TEXT,
    "uploaded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Attachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LabReport" (
    "id" TEXT NOT NULL,
    "email_id" TEXT NOT NULL,
    "test_id" TEXT,
    "attachment_id" TEXT,
    "lot_number" TEXT,
    "source_type" TEXT NOT NULL DEFAULT 'UNKNOWN',
    "source_attachment_filename" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING_REVIEW',
    "metadata_json" TEXT,
    "results_json" TEXT,
    "raw_ai_json" TEXT NOT NULL,
    "review_notes" TEXT,
    "reviewed_at" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LabReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MoleculeResult" (
    "id" TEXT NOT NULL,
    "lab_report_id" TEXT NOT NULL,
    "molecule_id" TEXT,
    "molecule_name" TEXT NOT NULL,
    "cas_number" TEXT,
    "result" TEXT,
    "numeric_result" DOUBLE PRECISION,
    "unit" TEXT,
    "reporting_limit" TEXT,
    "method_detection_limit" TEXT,
    "specification_limit" TEXT,
    "method" TEXT,
    "status" TEXT,
    "is_detected" BOOLEAN,
    "is_compliant" BOOLEAN,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MoleculeResult_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Molecule" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "normalized_name" TEXT NOT NULL,
    "cas_number" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Molecule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MoleculeAlias" (
    "id" TEXT NOT NULL,
    "molecule_id" TEXT NOT NULL,
    "alias" TEXT NOT NULL,
    "normalized_alias" TEXT NOT NULL,
    "source" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MoleculeAlias_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ComplianceStandard" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "fallback_limit" DOUBLE PRECISION NOT NULL DEFAULT 0.01,
    "fallback_unit" TEXT NOT NULL DEFAULT 'mg/kg',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ComplianceStandard_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ComplianceProfile" (
    "id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "standard_id" TEXT NOT NULL,
    "fallback_limit" DOUBLE PRECISION NOT NULL DEFAULT 0.01,
    "fallback_unit" TEXT NOT NULL DEFAULT 'mg/kg',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ComplianceProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ComplianceLimit" (
    "id" TEXT NOT NULL,
    "profile_id" TEXT,
    "standard_id" TEXT NOT NULL,
    "molecule_id" TEXT NOT NULL,
    "product_id" TEXT,
    "limit_value" DOUBLE PRECISION NOT NULL,
    "unit" TEXT NOT NULL DEFAULT 'mg/kg',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "limit_kind" TEXT NOT NULL DEFAULT 'VALUE',
    "source_value" TEXT,
    "residue_definition" TEXT,
    "is_sum_definition" BOOLEAN NOT NULL DEFAULT false,
    "enforcement_date" TIMESTAMP(3),
    "regulation_ref" TEXT,
    "footnotes" TEXT,
    "feasibility" BOOLEAN,
    "nabl" BOOLEAN,
    "feasibility_note" TEXT,
    "nabl_note" TEXT,
    "applies_to" TEXT,
    "source_commodity" TEXT,
    "source_file" TEXT,
    "snapshot_date" TIMESTAMP(3),
    "verification_status" TEXT NOT NULL DEFAULT 'UNVERIFIED',

    CONSTRAINT "ComplianceLimit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ComplianceChangeLog" (
    "id" TEXT NOT NULL,
    "profile_id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "before_json" TEXT,
    "after_json" TEXT,
    "actor" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ComplianceChangeLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LabReportComplianceCheck" (
    "id" TEXT NOT NULL,
    "lab_report_id" TEXT NOT NULL,
    "standard_id" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "is_compliant" BOOLEAN,
    "notes" TEXT,
    "checked_at" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LabReportComplianceCheck_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LabReportComplianceMoleculeResult" (
    "id" TEXT NOT NULL,
    "compliance_check_id" TEXT NOT NULL,
    "molecule_result_id" TEXT NOT NULL,
    "molecule_id" TEXT,
    "measured_value" DOUBLE PRECISION,
    "measured_unit" TEXT,
    "limit_value" DOUBLE PRECISION NOT NULL,
    "limit_unit" TEXT NOT NULL,
    "limit_source" TEXT NOT NULL,
    "fallback_used" BOOLEAN NOT NULL DEFAULT false,
    "is_detected" BOOLEAN,
    "is_compliant" BOOLEAN,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LabReportComplianceMoleculeResult_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SystemSetting" (
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SystemSetting_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "LoginCode" (
    "email" TEXT NOT NULL,
    "code_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "sent_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LoginCode_pkey" PRIMARY KEY ("email")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "ip" TEXT,
    "user_agent" TEXT,
    "last_seen" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revoked_at" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AILog" (
    "id" TEXT NOT NULL,
    "message_id" TEXT,
    "prompt_sent" TEXT NOT NULL,
    "response_received" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AILog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Lot_lot_number_key" ON "Lot"("lot_number");

-- CreateIndex
CREATE UNIQUE INDEX "Email_message_id_key" ON "Email"("message_id");

-- CreateIndex
CREATE UNIQUE INDEX "Molecule_normalized_name_key" ON "Molecule"("normalized_name");

-- CreateIndex
CREATE UNIQUE INDEX "MoleculeAlias_normalized_alias_key" ON "MoleculeAlias"("normalized_alias");

-- CreateIndex
CREATE UNIQUE INDEX "ComplianceStandard_code_key" ON "ComplianceStandard"("code");

-- CreateIndex
CREATE UNIQUE INDEX "ComplianceProfile_product_id_standard_id_key" ON "ComplianceProfile"("product_id", "standard_id");

-- CreateIndex
CREATE UNIQUE INDEX "ComplianceLimit_profile_id_molecule_id_key" ON "ComplianceLimit"("profile_id", "molecule_id");

-- CreateIndex
CREATE UNIQUE INDEX "ComplianceLimit_standard_id_molecule_id_product_id_key" ON "ComplianceLimit"("standard_id", "molecule_id", "product_id");

-- CreateIndex
CREATE UNIQUE INDEX "LabReportComplianceCheck_lab_report_id_standard_id_key" ON "LabReportComplianceCheck"("lab_report_id", "standard_id");

-- CreateIndex
CREATE UNIQUE INDEX "LabReportComplianceMoleculeResult_compliance_check_id_molec_key" ON "LabReportComplianceMoleculeResult"("compliance_check_id", "molecule_result_id");

-- CreateIndex
CREATE UNIQUE INDEX "Session_token_hash_key" ON "Session"("token_hash");

-- CreateIndex
CREATE INDEX "Session_email_idx" ON "Session"("email");

-- CreateIndex
CREATE INDEX "Session_expires_at_idx" ON "Session"("expires_at");

-- AddForeignKey
ALTER TABLE "LabContact" ADD CONSTRAINT "LabContact_lab_id_fkey" FOREIGN KEY ("lab_id") REFERENCES "Lab"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lot" ADD CONSTRAINT "Lot_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lot" ADD CONSTRAINT "Lot_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "Variant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lot" ADD CONSTRAINT "Lot_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Test" ADD CONSTRAINT "Test_lot_id_fkey" FOREIGN KEY ("lot_id") REFERENCES "Lot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Test" ADD CONSTRAINT "Test_lab_id_fkey" FOREIGN KEY ("lab_id") REFERENCES "Lab"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Test" ADD CONSTRAINT "Test_test_type_id_fkey" FOREIGN KEY ("test_type_id") REFERENCES "TestType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Test" ADD CONSTRAINT "Test_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "Vendor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Test" ADD CONSTRAINT "Test_sampled_by_staff_id_fkey" FOREIGN KEY ("sampled_by_staff_id") REFERENCES "Staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Email" ADD CONSTRAINT "Email_test_id_fkey" FOREIGN KEY ("test_id") REFERENCES "Test"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_email_id_fkey" FOREIGN KEY ("email_id") REFERENCES "Email"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LabReport" ADD CONSTRAINT "LabReport_email_id_fkey" FOREIGN KEY ("email_id") REFERENCES "Email"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LabReport" ADD CONSTRAINT "LabReport_test_id_fkey" FOREIGN KEY ("test_id") REFERENCES "Test"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LabReport" ADD CONSTRAINT "LabReport_attachment_id_fkey" FOREIGN KEY ("attachment_id") REFERENCES "Attachment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MoleculeResult" ADD CONSTRAINT "MoleculeResult_lab_report_id_fkey" FOREIGN KEY ("lab_report_id") REFERENCES "LabReport"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MoleculeResult" ADD CONSTRAINT "MoleculeResult_molecule_id_fkey" FOREIGN KEY ("molecule_id") REFERENCES "Molecule"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MoleculeAlias" ADD CONSTRAINT "MoleculeAlias_molecule_id_fkey" FOREIGN KEY ("molecule_id") REFERENCES "Molecule"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComplianceProfile" ADD CONSTRAINT "ComplianceProfile_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComplianceProfile" ADD CONSTRAINT "ComplianceProfile_standard_id_fkey" FOREIGN KEY ("standard_id") REFERENCES "ComplianceStandard"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComplianceLimit" ADD CONSTRAINT "ComplianceLimit_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "ComplianceProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComplianceLimit" ADD CONSTRAINT "ComplianceLimit_standard_id_fkey" FOREIGN KEY ("standard_id") REFERENCES "ComplianceStandard"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComplianceLimit" ADD CONSTRAINT "ComplianceLimit_molecule_id_fkey" FOREIGN KEY ("molecule_id") REFERENCES "Molecule"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComplianceLimit" ADD CONSTRAINT "ComplianceLimit_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComplianceChangeLog" ADD CONSTRAINT "ComplianceChangeLog_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "ComplianceProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LabReportComplianceCheck" ADD CONSTRAINT "LabReportComplianceCheck_lab_report_id_fkey" FOREIGN KEY ("lab_report_id") REFERENCES "LabReport"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LabReportComplianceCheck" ADD CONSTRAINT "LabReportComplianceCheck_standard_id_fkey" FOREIGN KEY ("standard_id") REFERENCES "ComplianceStandard"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LabReportComplianceMoleculeResult" ADD CONSTRAINT "LabReportComplianceMoleculeResult_compliance_check_id_fkey" FOREIGN KEY ("compliance_check_id") REFERENCES "LabReportComplianceCheck"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LabReportComplianceMoleculeResult" ADD CONSTRAINT "LabReportComplianceMoleculeResult_molecule_result_id_fkey" FOREIGN KEY ("molecule_result_id") REFERENCES "MoleculeResult"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LabReportComplianceMoleculeResult" ADD CONSTRAINT "LabReportComplianceMoleculeResult_molecule_id_fkey" FOREIGN KEY ("molecule_id") REFERENCES "Molecule"("id") ON DELETE SET NULL ON UPDATE CASCADE;

