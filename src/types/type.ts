import { Document } from "mongoose";

export enum FieldType {
  Text = "text",
  Number = "number",
  Boolean = "boolean",
  Date = "date",
  Select = "select",
  MultiSelect = "multi_select",
  Url = "url",
}

export interface IFieldDefinition {
  key: string;
  label: string;
  fieldType: FieldType;
  required?: boolean;
  options?: string[]; // for select / multi_select
  defaultValue?: any;
}

export interface IType extends Document {
  name: string;
  description?: string;
  fields: IFieldDefinition[];
  userId: string;
  createdAt: Date;
  updatedAt: Date;
}
