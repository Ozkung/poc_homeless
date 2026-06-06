export type FieldType =
  | 'text'
  | 'number'
  | 'select'
  | 'multiselect'
  | 'radio'
  | 'checkbox'
  | 'scale'
  | 'date'
  | 'textarea'
  | 'photo';

export interface FormField {
  id: string;
  type: FieldType;
  label: string;
  placeholder?: string;
  options?: string[];
  required: boolean;
  order: number;
  min?: number;
  max?: number;
}

export interface FormSchema {
  fields: FormField[];
}
