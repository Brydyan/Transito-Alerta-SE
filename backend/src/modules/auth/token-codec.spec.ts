import { BadRequestException } from '@nestjs/common';

import { decodeTokenOrThrow, generateToken } from './token-codec';

describe('token-codec (T3.6 design D4, pure)', () => {
  describe('generateToken', () => {
    it('produces a base64url string decoding to exactly 32 bytes', () => {
      const token = generateToken();
      expect(/^[A-Za-z0-9_-]+$/.test(token)).toBe(true);
      expect(Buffer.from(token, 'base64url').length).toBe(32);
    });

    it('produces a different token on every call', () => {
      expect(generateToken()).not.toEqual(generateToken());
    });
  });

  describe('decodeTokenOrThrow', () => {
    it('accepts a well-formed token and returns it unchanged', () => {
      const token = generateToken();
      expect(decodeTokenOrThrow(token)).toBe(token);
    });

    it('throws 400 INVALID_TOKEN on empty input', () => {
      expect(() => decodeTokenOrThrow('')).toThrow(BadRequestException);
    });

    it('throws 400 INVALID_TOKEN on non-base64url characters', () => {
      expect(() => decodeTokenOrThrow('not a valid token!!')).toThrow(BadRequestException);
    });

    it('throws 400 INVALID_TOKEN on a wrong-length decode (too short)', () => {
      const short = Buffer.from('short').toString('base64url');
      expect(() => decodeTokenOrThrow(short)).toThrow(BadRequestException);
    });

    it('error body carries code INVALID_TOKEN', () => {
      try {
        decodeTokenOrThrow('!!!');
        fail('expected throw');
      } catch (e) {
        expect((e as BadRequestException).getResponse()).toMatchObject({ code: 'INVALID_TOKEN' });
      }
    });
  });
});
