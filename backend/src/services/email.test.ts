import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { extractPdfText } from './email';

describe('extractPdfText', () => {
  it('parses PDF buffers and returns extracted text with a trailing newline', async () => {
    const mockPdf = Buffer.from('%PDF-1.4 mock lab report');
    let parserCallCount = 0;

    const text = await extractPdfText('Lot_Report.PDF', mockPdf, async (buffer) => {
      parserCallCount += 1;
      assert.equal(buffer, mockPdf);

      return {
        text: 'Lot Number: LOT-123\nResult: PASS',
      };
    });

    assert.equal(parserCallCount, 1);
    assert.equal(text, 'Lot Number: LOT-123\nResult: PASS\n');
  });

  it('does not send non-PDF attachments to the PDF parser', async () => {
    const text = await extractPdfText('invoice.txt', Buffer.from('not a pdf'), async () => {
      throw new Error('Parser should not be called for non-PDF attachments');
    });

    assert.equal(text, '');
  });

  it('returns empty text when a PDF cannot be parsed', async () => {
    const originalConsoleError = console.error;
    console.error = () => {};

    try {
      const text = await extractPdfText('broken.pdf', Buffer.from('%PDF corrupt'), async () => {
        throw new Error('Invalid PDF');
      });

      assert.equal(text, '');
    } finally {
      console.error = originalConsoleError;
    }
  });
});
