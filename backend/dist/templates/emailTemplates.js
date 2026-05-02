"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getTestRequestEmailTemplate = getTestRequestEmailTemplate;
function getTestRequestEmailTemplate(lotNumber, labName, testId) {
    return `
    <h2>Test Request for Lot: ${lotNumber}</h2>
    <p>Dear ${labName},</p>
    <p>Please find the attached testing guidelines and PO for this lot.</p>
    <br/>
    <p><small>System Tracking ID: ${testId}</small></p>
  `;
}
