import pino from 'pino';
import { AppError } from '../middleware/error.middleware';
import { i18next } from '../i18n';
import type { PanVerifier, VerificationResult } from './pan.verifier';

const logger = pino({ name: 'setu-pan-verifier' });

const CONSENT_GIVEN = 'Y';
const VERIFICATION_REASON = 'Verify PAN ownership to link the user\'s financial accounts';
const VERIFICATION_SUCCESS = 'SUCCESS';

interface SetuPanResponse {
  verification?: string;
  message?: string;
  data?: {
    full_name?: string;
  };
  traceId?: string;
}

interface SetuErrorResponse {
  traceId?: string;
}

export class SetuPanVerifier implements PanVerifier {
  constructor(
    private readonly baseUrl: string,
    private readonly clientId: string,
    private readonly clientSecret: string,
    private readonly productInstanceId: string,
  ) {}

  async verify(pan: string, lng = 'en'): Promise<VerificationResult> {
    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}/api/verify/pan`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-client-id': this.clientId,
          'x-client-secret': this.clientSecret,
          'x-product-instance-id': this.productInstanceId,
        },
        body: JSON.stringify({ pan, consent: CONSENT_GIVEN, reason: VERIFICATION_REASON }),
      });
    } catch (err) {
      logger.error({ err }, 'Setu PAN verification request failed');
      throw this.unavailableError(lng);
    }

    if (!response.ok) {
      const traceId = await this.readTraceId(response);
      logger.warn({ status: response.status, traceId }, 'Setu PAN verification returned non-2xx');
      throw this.unavailableError(lng);
    }

    const body = (await response.json()) as SetuPanResponse;
    const status = (body.verification ?? '').toUpperCase();

    return {
      valid: status === VERIFICATION_SUCCESS,
      holderName: body.data?.full_name,
      status,
      message: body.message,
      traceId: body.traceId,
    };
  }

  private async readTraceId(response: Response): Promise<string | undefined> {
    try {
      const body = (await response.json()) as SetuErrorResponse;
      return body.traceId;
    } catch {
      return undefined;
    }
  }

  private unavailableError(lng: string): AppError {
    return new AppError(
      'PAN_KYC_UNAVAILABLE',
      502,
      i18next.t('error.pan_kyc_unavailable', { lng }),
    );
  }
}
