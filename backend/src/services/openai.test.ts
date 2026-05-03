import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  analyzeLabReportSection,
  buildSectionPrompt,
  normalizeReports,
  PROMPT_VERSION,
} from './openai';

describe('OpenAI lab report analysis (section-based)', () => {
  it('builds an attachment-section prompt that includes the PDF text and filename', () => {
    const prompt = buildSectionPrompt({
      kind: 'attachment',
      sourceFilename: 'lot_report.pdf',
      text: [
        'Report ID: RPT-456',
        'Lab: Acme Labs',
        'Lot No. LOT-123',
        'Sample submitted: 2026-04-01',
        'Sample condition: Intact',
        'Molecule A: Not Detected',
        'Molecule B: 0.02 ppm',
      ].join('\n'),
    });

    assert.match(prompt, /ATTACHMENT: lot_report\.pdf/);
    assert.match(prompt, /Report ID: RPT-456/);
    assert.match(prompt, /Lot No\. LOT-123/);
    assert.match(prompt, /"sourceType": "ATTACHMENT"/);
    assert.match(prompt, /"undetectedMolecules":/);
    assert.match(prompt, /"undetectedSharedDefaults":/);
    assert.match(prompt, /Set "sourceAttachmentFilename" to "lot_report\.pdf"/);
    assert.match(prompt, /DETECTED analytes ONLY/);
  });

  it('builds a body-section prompt with EMAIL_BODY tagging', () => {
    const prompt = buildSectionPrompt({
      kind: 'body',
      text: 'Lab summary: Lot LOT-99 PASSED. All analytes BLQ.',
    });

    assert.match(prompt, /EMAIL BODY/);
    assert.match(prompt, /"sourceType": "EMAIL_BODY"/);
    assert.match(prompt, /"sourceAttachmentFilename" to null/);
    assert.match(prompt, /Lot LOT-99 PASSED/);
  });

  it('sends the section prompt with json_object + max_tokens + temperature 0', async () => {
    let createParams: any;
    const responseBody = {
      reports: [
        {
          lotNumber: 'LOT-123',
          sourceType: 'ATTACHMENT',
          sourceAttachmentFilename: 'lot.pdf',
          metadata: { reportId: 'RPT-1', lotNumber: 'LOT-123' },
          results: { summary: 'Compliant', isValid: true },
          extractionQuality: { detectedCount: 1, undetectedCount: 1, notes: null, visibleAnalyteCountEstimate: 2 },
          moleculeResults: [
            { moleculeName: 'Molecule B', result: '0.02 ppm', numericResult: 0.02, unit: 'ppm', isCompliant: true },
          ],
          undetectedMolecules: ['Molecule A'],
          undetectedSharedDefaults: { result: 'Not Detected', reportingLimit: '0.01 ppm', isCompliant: true },
        },
      ],
    };

    const client = {
      chat: {
        completions: {
          create: async (params: any) => {
            createParams = params;
            return {
              choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(responseBody) } }],
            };
          },
        },
      },
    };

    const created: any[] = [];
    const logRepository = {
      aILog: { create: async (p: any) => { created.push(p); return {}; } },
    };

    const result = await analyzeLabReportSection(
      { kind: 'attachment', sourceFilename: 'lot.pdf', text: 'PDF text body' },
      'gmail-123',
      client,
      logRepository,
      'trace-1'
    );

    assert.deepEqual(result, responseBody.reports);
    assert.equal(createParams.response_format.type, 'json_object');
    assert.equal(createParams.temperature, 0);
    assert.equal(typeof createParams.max_tokens, 'number');
    assert.ok(createParams.max_tokens >= 1000);
    assert.equal(created.length, 1);
    assert.equal(created[0].data.message_id, 'gmail-123#attachment:lot.pdf');
  });

  it('throws and stamps an error log when finish_reason is "length"', async () => {
    const client = {
      chat: {
        completions: {
          create: async () => ({
            choices: [{ finish_reason: 'length', message: { content: '{"reports":[' } }],
          }),
        },
      },
    };
    const created: any[] = [];
    const logRepository = {
      aILog: { create: async (p: any) => { created.push(p); return {}; } },
    };

    await assert.rejects(
      analyzeLabReportSection(
        { kind: 'attachment', sourceFilename: 'big.pdf', text: 'huge text' },
        'gmail-trunc',
        client,
        logRepository,
        'trace-trunc'
      ),
      /finish_reason=length/
    );

    assert.equal(created.length, 1);
    const errPayload = JSON.parse(created[0].data.response_received);
    assert.match(errPayload.error, /finish_reason=length/);
    assert.equal(errPayload.promptVersion, PROMPT_VERSION);
  });

  it('logs and rethrows when OpenAI returns malformed JSON', async () => {
    const client = {
      chat: {
        completions: {
          create: async () => ({
            choices: [{ finish_reason: 'stop', message: { content: 'not-json' } }],
          }),
        },
      },
    };
    const created: any[] = [];
    const logRepository = {
      aILog: { create: async (p: any) => { created.push(p); return {}; } },
    };

    await assert.rejects(
      analyzeLabReportSection(
        { kind: 'body', text: 'Body text long enough to attempt parse' },
        'gmail-bad-json',
        client,
        logRepository
      ),
      SyntaxError
    );

    assert.equal(created.length, 2);
    assert.equal(created[0].data.response_received, 'not-json');
    assert.match(JSON.parse(created[1].data.response_received).error, /Unexpected token|not valid JSON/);
  });

  it('throws when OpenAI returns empty content', async () => {
    const client = {
      chat: {
        completions: {
          create: async () => ({
            choices: [{ finish_reason: 'stop', message: { content: '' } }],
          }),
        },
      },
    };
    const logRepository = { aILog: { create: async () => ({}) } };

    await assert.rejects(
      analyzeLabReportSection(
        { kind: 'attachment', sourceFilename: 'x.pdf', text: 'x' },
        'gmail-empty',
        client,
        logRepository
      ),
      /No content received from OpenAI/
    );
  });
});

describe('normalizeReports', () => {
  it('returns parsed.reports when the array exists', () => {
    assert.deepEqual(normalizeReports({ reports: [{ lotNumber: 'A' }] }), [{ lotNumber: 'A' }]);
  });

  it('wraps a legacy single-report shape into an array', () => {
    assert.deepEqual(
      normalizeReports({ lotNumber: 'A', metadata: {}, moleculeResults: [] }),
      [{ lotNumber: 'A', metadata: {}, moleculeResults: [] }]
    );
  });

  it('returns the array as-is when given an array', () => {
    const arr = [{ lotNumber: 'B' }];
    assert.deepEqual(normalizeReports(arr), arr);
  });

  it('returns an empty array for unrecognized shapes', () => {
    assert.deepEqual(normalizeReports({ unrelated: 1 }), []);
    assert.deepEqual(normalizeReports(null), []);
    assert.deepEqual(normalizeReports('string'), []);
  });
});
