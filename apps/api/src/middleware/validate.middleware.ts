import type { Request, Response, NextFunction } from 'express';
import { type ZodSchema } from 'zod';

interface ValidateTarget {
  body?: ZodSchema;
  params?: ZodSchema;
  query?: ZodSchema;
}

export const validate =
  (schemas: ValidateTarget) =>
  (req: Request, _res: Response, next: NextFunction): void => {
    if (schemas.body) {
      req.body = schemas.body.parse(req.body);
    }
    if (schemas.params) {
      req.params = schemas.params.parse(req.params) as Record<string, string>;
    }
    if (schemas.query) {
      req.query = schemas.query.parse(req.query) as Record<string, string>;
    }
    next();
  };
