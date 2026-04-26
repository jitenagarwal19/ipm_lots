# IPM Report Tracking System – Full PRD (Phase 1 with Phase 2 & 3 Context)

## Version: 1.0  
## Owner: Jiten / Suman Exports  
## Tech Stack: Node.js (TypeScript), React (Next.js), PostgreSQL  

---

# 1. SYSTEM VISION

This system is designed to become the **central traceability and quality control backbone** for spice export operations.

It will:
- Track IPM test lifecycle per lot
- Capture and organize lab communications
- Enable structured interpretation of reports (Phase 2)
- Ensure auditability and reduce export risk

---

# 2. PHASE STRATEGY

## Phase 1 (Current Scope)
- Email-based workflow
- Lot + Test tracking
- Email ingestion
- Attachment storage
- Manual mapping (critical)
- No AI

---

## Phase 2 (AI Layer)
- Extract structured data from emails + PDFs
- Identify lot number, molecules, limits, result
- Assist mapping and reduce manual work

---

## Phase 3 (Advanced Processing)
- PDF parsing / OCR
- Image uploads at different stages
- Full traceability system

---

# 3. CORE CONCEPTS

## 3.1 Entity Definitions

### Lot
A physical batch of product.

### Test
A testing request for a lot (can be multiple per lot).

### Email
Incoming communication from lab.

### Attachment
Files sent via email.

---

## 3.2 Relationship Model

```plaintext
Lot
 ├── Test
       ├── Emails
       ├── Attachments
       ├── (Future) Results
4. USER ROLES
Operations Executive
Creates tests
Maps emails
QC Manager
Reviews reports
Admin
Configures system
5. FUNCTIONAL REQUIREMENTS
5.1 SETTINGS MODULE (CONTROL CENTER)
Labs
name
primary_email
cc_emails
is_active
Products
name
Product Variants (Optional)
product_id
variety
grade
Companies
name
Test Types
name
country_standard
Email Configuration

Preferred:

Gmail API

Alternative:

IMAP/SMTP
Tracking Label

Example:

test-report
5.2 TEST CREATION FLOW
Inputs:
Lot Number
Product
Variant (optional)
Lab
Company
Test Type
Destination
System Actions:
Create Lot (if not exists)
Create Test (status = INITIATED)
Send Email to lab
Store thread_id
Update status → EMAIL_SENT
5.3 EMAIL INGESTION
Trigger:
Poll Gmail label
Capture:
message_id (UNIQUE)
thread_id
subject
body
from_email
received_at
Rule:
If message_id exists → skip
5.4 ATTACHMENT HANDLING
Extract attachments
Upload to storage (S3/local)
Store:
file_url
file_type
5.5 MANUAL MAPPING UI
Features:
View email + attachments
Link to:
Lot
Test
Actions:
Map email → test
Update status → REPORT_RECEIVED
5.6 STATUS MANAGEMENT
Test Status Flow:
INITIATED
EMAIL_SENT
AWAITING_REPORT
REPORT_RECEIVED
REVIEW_PENDING (future)
COMPLETED (future)
FAILED (future)
5.7 LOT VIEW
Lot details
Tests list
Emails
Attachments
5.8 TEST VIEW
Test details
Status
Emails
Attachments
6. DATABASE SCHEMA
lots
id
lot_number (UNIQUE)
product_id
company_id
created_at
tests
id
lot_id
lab_id
test_type_id
destination
status
email_thread_id
created_at
emails
id
message_id (UNIQUE)
thread_id
subject
body
from_email
received_at
attachments
id
email_id
file_url
file_type
uploaded_at
labs
id
name
primary_email
cc_emails
is_active
products
id
name
companies
id
name
test_types
id
name
country_standard
7. EDGE CASES & FAILURE SCENARIOS
Email Issues
Duplicate emails → use message_id
New thread → don’t rely only on thread_id
Subject changes → weak signal
Multiple lots in one email → allow multi-mapping
Missing label → fallback needed
Attachment Issues
No attachment → flag
Multiple files → classify
Corrupt file → mark invalid
Scanned PDF → OCR (Phase 3)
Large files → stream upload
Mapping Issues
Missing lot → manual mapping
Wrong lot → review required
Multiple tests per lot → separate tests
Retest → track history
AI Risks (Phase 2)
Wrong extraction → manual review
Invalid JSON → schema validation
Missing data → fallback
User Errors
Wrong mapping → undo + logs
Duplicate test → validation
Master data change → snapshot
System Risks
Email API failure → retry
Queue failure → dead-letter
DB failure → transactions
Timezone issues → use UTC
Business Risks
Wrong result → export failure
Delayed reports → alerts
Revised report → versioning
8. NON-FUNCTIONAL REQUIREMENTS
Performance
Email sync < 5 min
Reliability
Idempotent processing
No duplicate emails
Security
Encrypted credentials
Scalability
10k+ emails
1k+ lots
9. ARCHITECTURE OVERVIEW
Stack
Frontend
Next.js (React)
Backend
Node.js (TypeScript)
Database
PostgreSQL
Storage
AWS S3
Queue
Redis + BullMQ
Email
Gmail API
Event Flow
Form Submit
   → Create Test
   → Send Email

Email Received
   → Queue Job
   → Store Email
   → Store Attachments

Manual Mapping
   → Link Email → Test
10. FORWARD COMPATIBILITY
Phase 2 – AI Extraction
Input:
subject
body
attachment URLs
Output:
{
  "lot_number": "",
  "result": "PASS/FAIL",
  "molecules": []
}
New Table:
test_results
- id
- test_id
- raw_ai_output
- parsed_data
- status
Phase 3 – Images
lot_images
- id
- lot_id
- test_id
- stage
- image_type
- url
11. DESIGN PRINCIPLES
Never trust email structure
Never trust AI blindly
Always allow manual override
Always store raw data
Design for multi-test per lot
12. SUCCESS CRITERIA

✔ All tests initiated via system
✔ All emails captured
✔ No duplicate processing
✔ Emails mapped reliably
✔ Full traceability per lot

13. BUILD ORDER
Database schema
Settings module
Test creation + email send
Email ingestion
Attachment storage
Manual mapping UI
Lot/Test views
FINAL NOTE

This is not just software.

This is:
→ Quality control system
→ Traceability engine
→ Export risk management layer

Build for correctness first. Automation later.