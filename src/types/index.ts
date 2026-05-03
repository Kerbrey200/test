export enum UserRole {
  ADMIN = 'ADMIN',
  FOREMAN = 'FOREMAN',
  WAREHOUSE = 'WAREHOUSE',
  PTO = 'PTO',
  CHIEF_ENGINEER = 'CHIEF_ENGINEER',
  ACCOUNTING = 'ACCOUNTING',
  SUPPLY = 'SUPPLY',
  MANAGEMENT = 'MANAGEMENT',
  PENDING = 'PENDING'
}

export interface UserProfile {
  uid: string;
  fullName: string;
  role: UserRole | 'PENDING';
  objectId?: string;
  email: string;
  createdAt: any;
  updatedAt: any;
}

export interface Material {
  id: string;
  name: string;
  code: string;
  photoUrl?: string;
  qrCodeData?: string;
  unit: string;
  createdAt: any;
}

export interface Project {
  id: string;
  name: string;
  address: string;
  createdAt: any;
}

export enum RequisitionStatus {
  DRAFT = 'DRAFT',
  PENDING_CHIEF = 'PENDING_CHIEF',
  PENDING_PTO = 'PENDING_PTO',
  PENDING_MGMT = 'PENDING_MGMT',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED'
}

export interface RequisitionItem {
  materialId: string;
  name: string;
  quantity: number;
  unit: string;
}

export interface Requisition {
  id: string;
  objectId: string;
  requesterUid: string;
  items: RequisitionItem[];
  status: RequisitionStatus;
  history: {
    status: RequisitionStatus;
    timestamp: any;
    userUid: string;
    comment?: string;
  }[];
  createdAt: any;
  updatedAt: any;
}

export enum ReportStatus {
  DRAFT = 'DRAFT',
  PENDING_PTO = 'PENDING_PTO',
  PENDING_CHIEF = 'PENDING_CHIEF',
  APPROVED = 'APPROVED'
}

export interface TechnicalReport {
  id: string;
  objectId: string;
  foremanUid: string;
  month: number;
  year: number;
  items: {
    materialId: string;
    name: string;
    quantity: number;
    price?: number;
    total?: number;
    unit: string;
  }[];
  status: ReportStatus;
  ptoApproved: boolean;
  chiefApproved: boolean;
  createdAt: any;
  updatedAt: any;
}

export interface Waybill {
  id: string;
  fromUid: string;
  toUid: string;
  items: {
    materialId: string;
    name: string;
    quantity: number;
    unit: string;
  }[];
  status: 'PENDING' | 'APPROVED';
  createdAt: any;
}

export interface Invoice {
  id: string;
  number: string;
  date: string;
  supplier: string;
  supplyOfficerUid: string;
  items: {
    materialId: string;
    name: string;
    price: number;
    quantity: number;
    unit: string;
  }[];
  createdAt: any;
}

export interface Inventory {
  id: string;
  holderId: string; // uid or warehouseId
  materialId: string;
  name: string;
  balance: number;
  totalReceived: number;
  totalUsed: number;
  unit: string;
  lastUpdated: any;
}
