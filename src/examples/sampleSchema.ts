export const sampleSchema = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  $id: 'https://example.com/customer.schema.json',
  title: 'Customer',
  type: 'object',
  minProperties: 2,
  required: ['id', 'name'],
  properties: {
    id: { type: 'string', pattern: '^C-[0-9]{3}$' },
    name: { type: 'string', minLength: 1, maxLength: 80 },
    email: { type: 'string', format: 'email' },
    age: { type: 'integer', minimum: 0, maximum: 130 },
    status: { enum: ['active', 'inactive'] },
    version: { const: 1 },
    address: { $ref: '#/$defs/Address' },
    tags: {
      type: 'array',
      maxItems: 5,
      uniqueItems: true,
      items: { type: 'string' },
    },
  },
  $defs: {
    Address: {
      title: 'Address',
      type: 'object',
      required: ['city'],
      properties: {
        street: { type: 'string' },
        city: { type: 'string', minLength: 1 },
        country: { type: 'string', default: 'IT' },
      },
    },
  },
} as const;

export const sampleSchemaText = JSON.stringify(sampleSchema, null, 2);

export const sampleInstance = {
  id: 'C-001',
  name: 'Mario Rossi',
  email: 'mario@example.com',
  age: 42,
  status: 'active',
  version: 1,
  address: {
    street: 'Via Roma 1',
    city: 'Roma',
    country: 'IT',
  },
  tags: ['customer', 'newsletter'],
} as const;

export const sampleInstanceText = JSON.stringify(sampleInstance, null, 2);
