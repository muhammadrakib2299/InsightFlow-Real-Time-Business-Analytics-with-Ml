import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac } from 'node:crypto';

/**
 * Minimal S3-compatible client. We talk to MinIO in dev and any
 * S3-compatible bucket in prod. We avoid the official AWS SDK so the
 * NestJS image stays slim — for PDFs we only need a signed PUT and a
 * signed GET, and AWS sig-v4 is small enough to inline.
 */
@Injectable()
export class S3Service {
  private readonly logger = new Logger(S3Service.name);
  private readonly endpoint: string;
  private readonly region: string;
  private readonly accessKey: string;
  private readonly secretKey: string;
  private readonly bucket: string;

  constructor(config: ConfigService) {
    this.endpoint = (
      config.get<string>('S3_ENDPOINT', 'http://minio:9000') as string
    ).replace(/\/+$/, '');
    this.region = config.get<string>('S3_REGION', 'us-east-1') as string;
    this.accessKey = config.get<string>('S3_ACCESS_KEY', 'minioadmin') as string;
    this.secretKey = config.get<string>('S3_SECRET_KEY', 'minioadmin') as string;
    this.bucket = config.get<string>('S3_BUCKET_PDF', 'insightflow-pdf') as string;
  }

  async upload(key: string, body: Buffer, contentType = 'application/pdf'): Promise<string> {
    const { url, headers } = this.signedRequest('PUT', key, body, contentType);
    const res = await fetch(url, {
      method: 'PUT',
      headers: { ...headers, 'content-type': contentType },
      body,
    });
    if (!res.ok) {
      throw new Error(`s3 upload failed: ${res.status} ${await res.text().catch(() => '')}`);
    }
    return key;
  }

  /** Build a presigned GET URL valid for `ttlSeconds`. */
  presignGet(key: string, ttlSeconds = 3600): string {
    const now = new Date();
    const amzDate = `${now.toISOString().replace(/[-:]|\.\d{3}/g, '')}`;
    const dateStamp = amzDate.slice(0, 8);
    const credential = `${this.accessKey}/${dateStamp}/${this.region}/s3/aws4_request`;
    const host = new URL(this.endpoint).host;
    const canonicalUri = `/${this.bucket}/${encodeURIComponent(key)}`;

    const params = new URLSearchParams({
      'X-Amz-Algorithm': 'AWS4-HMAC-SHA256',
      'X-Amz-Credential': credential,
      'X-Amz-Date': amzDate,
      'X-Amz-Expires': String(ttlSeconds),
      'X-Amz-SignedHeaders': 'host',
    });
    const canonicalQuery = [...params.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
      .join('&');

    const canonicalRequest = [
      'GET',
      canonicalUri,
      canonicalQuery,
      `host:${host}`,
      '',
      'host',
      'UNSIGNED-PAYLOAD',
    ].join('\n');

    const stringToSign = [
      'AWS4-HMAC-SHA256',
      amzDate,
      `${dateStamp}/${this.region}/s3/aws4_request`,
      sha256Hex(canonicalRequest),
    ].join('\n');

    const signingKey = this.deriveSigningKey(dateStamp);
    const signature = hmacHex(signingKey, stringToSign);
    return `${this.endpoint}${canonicalUri}?${canonicalQuery}&X-Amz-Signature=${signature}`;
  }

  private signedRequest(
    method: 'PUT' | 'GET',
    key: string,
    body: Buffer | '',
    contentType: string,
  ): { url: string; headers: Record<string, string> } {
    const now = new Date();
    const amzDate = `${now.toISOString().replace(/[-:]|\.\d{3}/g, '')}`;
    const dateStamp = amzDate.slice(0, 8);
    const host = new URL(this.endpoint).host;
    const canonicalUri = `/${this.bucket}/${encodeURIComponent(key)}`;
    const payloadHash =
      body === '' ? sha256Hex('') : sha256Hex(body.toString('binary'));

    const headers: Record<string, string> = {
      host,
      'x-amz-content-sha256': payloadHash,
      'x-amz-date': amzDate,
      'content-type': contentType,
    };

    const canonicalHeaders = Object.entries(headers)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}:${v}\n`)
      .join('');
    const signedHeaders = Object.keys(headers).sort().join(';');

    const canonicalRequest = [
      method,
      canonicalUri,
      '',
      canonicalHeaders,
      signedHeaders,
      payloadHash,
    ].join('\n');

    const stringToSign = [
      'AWS4-HMAC-SHA256',
      amzDate,
      `${dateStamp}/${this.region}/s3/aws4_request`,
      sha256Hex(canonicalRequest),
    ].join('\n');

    const signature = hmacHex(this.deriveSigningKey(dateStamp), stringToSign);
    const authHeader =
      `AWS4-HMAC-SHA256 Credential=${this.accessKey}/${dateStamp}/${this.region}/s3/aws4_request, ` +
      `SignedHeaders=${signedHeaders}, Signature=${signature}`;

    headers.authorization = authHeader;
    return { url: `${this.endpoint}${canonicalUri}`, headers };
  }

  private deriveSigningKey(dateStamp: string): Buffer {
    const kDate = hmacBuf(`AWS4${this.secretKey}`, dateStamp);
    const kRegion = hmacBuf(kDate, this.region);
    const kService = hmacBuf(kRegion, 's3');
    return hmacBuf(kService, 'aws4_request');
  }
}

function sha256Hex(input: string): string {
  return require('node:crypto').createHash('sha256').update(input).digest('hex');
}

function hmacBuf(key: string | Buffer, data: string): Buffer {
  return createHmac('sha256', key).update(data).digest();
}

function hmacHex(key: Buffer, data: string): string {
  return createHmac('sha256', key).update(data).digest('hex');
}
