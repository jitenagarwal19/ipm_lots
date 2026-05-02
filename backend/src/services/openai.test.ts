import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  analyzeLabReportWithClient,
  buildAnalyzeLabReportPrompt,
} from './openai';

describe('OpenAI lab report analysis', () => {
  it('builds a prompt that includes the extracted PDF text', () => {
    const prompt = buildAnalyzeLabReportPrompt(
      'Please find the attached lab report.',
      [
        'Report ID: RPT-456',
        'Lab: Acme Labs',
        'Lot No. LOT-123',
        'Sample submitted: 2026-04-01',
        'Sample condition: Intact',
        'Molecule A: Not Detected',
        'Molecule B: 0.02 ppm',
      ].join('\n')
    );

    assert.match(prompt, /Email Body:\s+Please find the attached lab report\./);
    assert.match(prompt, /Return every molecule\/analyte listed in the report/);
    assert.match(prompt, /Always return a "reports" array/);
    assert.match(prompt, /not only detected molecules/);
    assert.match(prompt, /Never collapse multiple analytes into a synthetic summary row/);
    assert.match(prompt, /Other analysed pesticides/);
    assert.match(prompt, /split them into separate moleculeResults entries/);
    assert.match(prompt, /If the report visibly lists around 50 analytes/);
    assert.match(prompt, /"extractionQuality":/);
    assert.match(prompt, /"reports":/);
    assert.match(prompt, /"metadata":/);
    assert.match(prompt, /"reportId":/);
    assert.match(prompt, /"labName":/);
    assert.match(prompt, /"dateSampleSubmitted":/);
    assert.match(prompt, /"sampleCondition":/);
    assert.match(prompt, /"moleculeResults":/);
    assert.match(prompt, /Attachment Text From All Attachments:/);
    assert.match(prompt, /Lot No\. LOT-123/);
    assert.match(prompt, /Molecule A: Not Detected/);
    assert.match(prompt, /Molecule B: 0\.02 ppm/);
    assert.match(prompt, /Respond strictly in JSON format/);
  });

  it('warns the model not to summarize grouped pesticide lists as one row', () => {
    const prompt = buildAnalyzeLabReportPrompt(
      'Attached pesticide residue report.',
      [
        '6. Chlorantraniliprole (0.01), Clothianidin (0.01), Cyantraniliprole (0.01)',
        '9. Difenoconazole (0.01)10. Dimethoate (0.01)11. Ethion (0.01)',
        '13. Fenpyroximate (0.01)14. Hexaconazole (0.01)15. Imidacloprid (0.01)',
        '29. Thiamethoxam (0.01)30. Triazophos (0.01)31. Tricyclazole (0.01)',
        'Other analysed pesticides: BLQ',
      ].join('\n')
    );

    assert.match(prompt, /Those phrases are not molecule names/);
    assert.match(prompt, /Chlorantraniliprole \(0\.01\), Clothianidin \(0\.01\), Cyantraniliprole \(0\.01\)/);
    assert.match(prompt, /must become three separate rows/);
    assert.match(prompt, /Include not-detected\/BLQ\/BDL\/ND analytes as separate rows/);
    assert.match(prompt, /hasCollapsedAnalyteGroup": false/);
  });

  it('sends parsed PDF text to OpenAI and supports full metadata plus every molecule result', async () => {
    let createParams: unknown;
    const createdLogs: unknown[] = [];
    const reports = [
      {
        lotNumber: 'LOT-123',
        sourceAttachmentFilename: 'report.pdf',
        metadata: {
          reportId: 'RPT-456',
          labName: 'Acme Labs',
          lotNumber: 'LOT-123',
          sampleId: 'SAMPLE-789',
          sampleName: 'IPM Lot sample',
          sampleType: 'Raw material',
          sampleCondition: 'Intact',
          dateSampleSubmitted: '2026-04-01',
          dateSampleCollected: null,
          dateReported: '2026-04-05',
          clientName: 'In-house Tooling',
          labAddress: null,
          reportStatus: 'Final',
        },
        results: {
          summary: 'All listed molecules are compliant',
          isValid: true,
        },
        moleculeResults: [
          {
            moleculeName: 'Molecule A',
            casNumber: null,
            result: 'Not Detected',
            numericResult: null,
            unit: 'ppm',
            reportingLimit: '0.01 ppm',
            methodDetectionLimit: null,
            specificationLimit: '< 0.10 ppm',
            method: 'LC-MS',
            status: 'not detected',
            isDetected: false,
            isCompliant: true,
            notes: null,
          },
          {
            moleculeName: 'Molecule B',
            casNumber: '123-45-6',
            result: '0.02 ppm',
            numericResult: 0.02,
            unit: 'ppm',
            reportingLimit: '0.01 ppm',
            methodDetectionLimit: '0.005 ppm',
            specificationLimit: '< 0.10 ppm',
            method: 'LC-MS',
            status: 'detected',
            isDetected: true,
            isCompliant: true,
            notes: 'Below limit',
          },
        ],
      },
    ];
    const responseBody = { reports };

    const client = {
      chat: {
        completions: {
          create: async (params: unknown) => {
            createParams = params;

            return {
              choices: [
                {
                  message: {
                    content: JSON.stringify(responseBody),
                  },
                },
              ],
            };
          },
        },
      },
    };

    const logRepository = {
      aILog: {
        create: async (params: unknown) => {
          createdLogs.push(params);
          return {};
        },
      },
    };

    const result = await analyzeLabReportWithClient(
      'Lab reply attached.',
      [
        'Report ID: RPT-456',
        'Lab: Acme Labs',
        'Lot No. LOT-123',
        'Sample submitted: 2026-04-01',
        'Sample condition: Intact',
        'Molecule A: Not Detected',
        'Molecule B: 0.02 ppm',
      ].join('\n'),
      'gmail-message-1',
      client,
      logRepository
    );

    assert.deepEqual(result, reports);
    assert.deepEqual(createParams, {
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'user',
          content: buildAnalyzeLabReportPrompt(
            'Lab reply attached.',
            [
              'Report ID: RPT-456',
              'Lab: Acme Labs',
              'Lot No. LOT-123',
              'Sample submitted: 2026-04-01',
              'Sample condition: Intact',
              'Molecule A: Not Detected',
              'Molecule B: 0.02 ppm',
            ].join('\n')
          ),
        },
      ],
      response_format: { type: 'json_object' },
    });
    assert.deepEqual(createdLogs, [
      {
        data: {
          message_id: 'gmail-message-1',
          prompt_sent: buildAnalyzeLabReportPrompt(
            'Lab reply attached.',
            [
              'Report ID: RPT-456',
              'Lab: Acme Labs',
              'Lot No. LOT-123',
              'Sample submitted: 2026-04-01',
              'Sample condition: Intact',
              'Molecule A: Not Detected',
              'Molecule B: 0.02 ppm',
            ].join('\n')
          ),
          response_received: JSON.stringify(responseBody),
        },
      },
    ]);
  });

  it('normalizes a legacy single-report response into an array', async () => {
    const singleReport = {
      lotNumber: 'LOT-123',
      metadata: { reportId: 'RPT-456' },
      moleculeResults: [],
    };

    const client = {
      chat: {
        completions: {
          create: async () => ({
            choices: [
              {
                message: {
                  content: JSON.stringify(singleReport),
                },
              },
            ],
          }),
        },
      },
    };

    const logRepository = {
      aILog: {
        create: async () => ({}),
      },
    };

    const result = await analyzeLabReportWithClient(
      'Body',
      'PDF text',
      'gmail-message-legacy-json',
      client,
      logRepository
    );

    assert.deepEqual(result, [singleReport]);
  });

  it('logs the raw OpenAI response before surfacing JSON parse failures', async () => {
    const createdLogs: unknown[] = [];
    const invalidJson = 'not-json';

    const client = {
      chat: {
        completions: {
          create: async () => ({
            choices: [
              {
                message: {
                  content: invalidJson,
                },
              },
            ],
          }),
        },
      },
    };

    const logRepository = {
      aILog: {
        create: async (params: unknown) => {
          createdLogs.push(params);
          return {};
        },
      },
    };

    await assert.rejects(
      analyzeLabReportWithClient(
        'Body',
        'PDF text',
        'gmail-message-bad-json',
        client,
        logRepository
      ),
      SyntaxError
    );

    assert.equal(createdLogs.length, 2);
    assert.deepEqual(createdLogs[0], {
      data: {
        message_id: 'gmail-message-bad-json',
        prompt_sent: buildAnalyzeLabReportPrompt('Body', 'PDF text'),
        response_received: invalidJson,
      },
    });
    assert.match(
      JSON.parse((createdLogs[1] as any).data.response_received).error,
      /Unexpected token|not valid JSON/
    );
  });

  it('propagates OpenAI client network failures', async () => {
    const client = {
      chat: {
        completions: {
          create: async () => {
            throw new Error("network down");
          },
        },
      },
    };
    const logRepository = {
      aILog: {
        create: async () => ({}),
      },
    };
    await assert.rejects(
      analyzeLabReportWithClient("Body", "PDF text", "gmail-net", client as any, logRepository as any),
      /network down/
    );
  });

  it('throws when OpenAI returns no message content', async () => {
    const client = {
      chat: {
        completions: {
          create: async () => ({
            choices: [{ message: { content: null as unknown as string | null } }],
          }),
        },
      },
    };
    const logRepository = {
      aILog: {
        create: async () => ({}),
      },
    };
    await assert.rejects(
      analyzeLabReportWithClient(
        'Body',
        'PDF text',
        'gmail-empty-content',
        client as any,
        logRepository as any
      ),
      /No content received from OpenAI/
    );
  });

  it('still parses OpenAI output when persisting the AI log fails', async () => {
    const client = {
      chat: {
        completions: {
          create: async () => ({
            choices: [{ message: { content: '{"reports":[]}' } }],
          }),
        },
      },
    };
    const logRepository = {
      aILog: {
        create: async () => {
          throw new Error("persist failed");
        },
      },
    };

    const result = await analyzeLabReportWithClient(
      "Body",
      "PDF text",
      "gmail-message-log-swallow",
      client as any,
      logRepository as any
    );

    assert.deepEqual(result, []);
  });
});
