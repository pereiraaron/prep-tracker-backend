import { IFieldDefinition, FieldType } from "../types";

interface ValidationResult {
  valid: boolean;
  errors: string[];
}

/**
 * Validates metadata values against a type's field definitions.
 * Returns errors for missing required fields and type mismatches.
 * Extra keys not in the definitions are allowed (flexible).
 */
export const validateMetadata = (
  metadata: Record<string, any> | undefined,
  fields: IFieldDefinition[]
): ValidationResult => {
  const errors: string[] = [];

  if (!fields || fields.length === 0) {
    return { valid: true, errors: [] };
  }

  const data = metadata || {};

  for (const field of fields) {
    const value = data[field.key];

    // Check required fields
    if (field.required && (value === undefined || value === null || value === "")) {
      errors.push(`"${field.label}" is required`);
      continue;
    }

    // Skip validation if value is not provided and not required
    if (value === undefined || value === null) continue;

    // Type validation
    switch (field.fieldType) {
      case FieldType.Text:
      case FieldType.Url:
        if (typeof value !== "string") {
          errors.push(`"${field.label}" must be a string`);
        }
        break;

      case FieldType.Number:
        if (typeof value !== "number") {
          errors.push(`"${field.label}" must be a number`);
        }
        break;

      case FieldType.Boolean:
        if (typeof value !== "boolean") {
          errors.push(`"${field.label}" must be a boolean`);
        }
        break;

      case FieldType.Date:
        if (isNaN(Date.parse(value))) {
          errors.push(`"${field.label}" must be a valid date`);
        }
        break;

      case FieldType.Select:
        if (field.options && !field.options.includes(value)) {
          errors.push(`"${field.label}" must be one of: ${field.options.join(", ")}`);
        }
        break;

      case FieldType.MultiSelect:
        if (!Array.isArray(value)) {
          errors.push(`"${field.label}" must be an array`);
        } else if (field.options) {
          const invalid = value.filter((v: string) => !field.options!.includes(v));
          if (invalid.length > 0) {
            errors.push(`"${field.label}" contains invalid values: ${invalid.join(", ")}`);
          }
        }
        break;
    }
  }

  return { valid: errors.length === 0, errors };
};
