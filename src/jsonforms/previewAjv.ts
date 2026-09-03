import Ajv from 'ajv';
import Ajv2020 from 'ajv/dist/2020';
import addFormats from 'ajv-formats';
import { isDraft07Dialect } from '../core';

/** JSON Forms' default AJV targets Draft-07; select the correct compiler explicitly. */
export function createPreviewAjv(dialect?: string): Ajv {
  const options = { allErrors: true, verbose: true, strict: false } as const;
  const ajv = isDraft07Dialect(dialect) ? new Ajv(options) : new Ajv2020(options);
  addFormats(ajv);
  return ajv;
}

