/**
 * Attribute System Types
 * Shared types for the dynamic attributes system
 */

export interface AttributeDefinition {
  id: number;
  key: string;
  label: string;
  description?: string;
  color: string;
  icon?: string;
  isSystem: boolean;
  isAutoDerived: boolean;
  showAsBadge: boolean;
  sortOrder: number;
  createdAt?: string;
}

export interface PersonAttribute {
  key: string;
  value: boolean;
  setAt: Date | string;
  definition: AttributeDefinition;
}

export interface AttributeHistoryEntry {
  id: string;
  personId: string;
  attributeKey: string;
  oldValue: boolean | null;
  newValue: boolean;
  changedAt: string;
  label?: string;
}

// API response types
export interface AttributesResponse {
  attributes: PersonAttribute[];
  badgeAttributes: PersonAttribute[];
  checkboxAttributes: PersonAttribute[];
}

export interface AttributeDefinitionsResponse {
  definitions: AttributeDefinition[];
}

export interface AttributeHistoryResponse {
  history: AttributeHistoryEntry[];
}

// Form types for creating/editing attributes
export interface CreateAttributeDefinition {
  key: string;
  label: string;
  description?: string;
  color: string;
  icon?: string;
  showAsBadge: boolean;
}

export interface UpdateAttributeDefinition {
  label?: string;
  description?: string;
  color?: string;
  icon?: string;
  showAsBadge?: boolean;
  sortOrder?: number;
}
