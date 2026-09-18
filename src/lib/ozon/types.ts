export interface OzonCategoryNode {
  description_category_id?: number;
  category_name?: string;
  disabled?: boolean;
  type_id?: number;
  type_name?: string;
  children?: OzonCategoryNode[];
}

export interface OzonCategoryTreeResponse {
  result: OzonCategoryNode[];
}

export interface OzonAttribute {
  id: number;
  name: string;
  description: string;
  type: string;
  is_required: boolean;
  is_collection: boolean;
  is_aspect: boolean;
  dictionary_id: number;
  group_id: number;
  group_name: string;
  attribute_complex_id: number;
  max_value_count: number;
  complex_is_collection?: boolean;
  category_dependent?: boolean;
}

export interface OzonCategoryAttributesResponse {
  result: OzonAttribute[];
}

export interface OzonAttributeValue {
  id: number;
  value: string;
  info: string;
  picture: string;
}

export interface OzonAttributeValuesResponse {
  result: OzonAttributeValue[];
  has_next?: boolean;
}

export type OzonLanguage = 'DEFAULT' | 'RU' | 'EN' | 'TR' | 'ZH_HANS';
