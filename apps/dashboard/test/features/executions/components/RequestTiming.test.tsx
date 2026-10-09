import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import RequestTiming from '../../../../src/features/executions/components/RequestTiming';

describe('request phase timing', () => {
  it('uses observed offsets and does not substitute missing output timing', () => {
    render(<RequestTiming timing={{dispatch_ms:100,headers_ms:500,first_output_ms:700,total_ms:1700,complete:true,http_status:200}} outputTokens="20" />);
    expect(screen.getByLabelText('Preparation: 100 ms')).toBeTruthy();
    expect(screen.getByLabelText('First output wait: 600 ms')).toBeTruthy();
    expect(screen.getByLabelText('Output stream: 1.00 s')).toBeTruthy();
    expect(screen.getByText('20 output tokens · 20.0 tok/s')).toBeTruthy();
    expect(screen.getByText('Total: 1.70 s')).toBeTruthy();
  });
  it('keeps interrupted output incomplete and omits throughput', () => {
    render(<RequestTiming timing={{dispatch_ms:100,headers_ms:500,first_output_ms:700,total_ms:1700,complete:false,http_status:200}} outputTokens="20" />);
    expect(screen.getByText('Observed: 1.70 s')).toBeTruthy();
    expect(screen.queryByText(/tok\/s/)).toBeNull();
  });
  it('shows an interrupted upstream wait without inventing response headers or delivery', () => {
    render(<RequestTiming timing={{dispatch_ms:100,headers_ms:null,first_output_ms:null,total_ms:800,complete:false,http_status:null}} outputTokens={null} />);
    expect(screen.getByLabelText('Response wait: 700 ms')).toBeTruthy();
    expect(screen.queryByText('Response delivery')).toBeNull();
    expect(screen.getByText('Observed: 800 ms')).toBeTruthy();
  });
  it('does not claim generation timing for nonstreamed or historical requests', () => {
    const {rerender} = render(<RequestTiming timing={{dispatch_ms:100,headers_ms:500,first_output_ms:null,total_ms:500,complete:true,http_status:200}} outputTokens="20" />);
    expect(screen.getByLabelText('Response wait: 400 ms')).toBeTruthy();
    expect(screen.queryByText(/tok\/s/)).toBeNull();
    rerender(<RequestTiming timing={null} outputTokens="20" />);
    expect(screen.getByText('Phase timing was not collected for this request.')).toBeTruthy();
  });
});
