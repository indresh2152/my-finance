export interface VerificationResult {
  valid: boolean;
  holderName?: string;
  status: string;
  message?: string;
  traceId?: string;
}

export interface PanVerifier {
  verify(pan: string, lng?: string): Promise<VerificationResult>;
}
