export interface User {
  id: string;
  email: string;
  username?: string;
  displayName: string;
  role: 'admin' | 'staff';
  isActive: boolean;
  createdAt: FirebaseFirestore.Timestamp;
  updatedAt: FirebaseFirestore.Timestamp;
}

export interface Collector {
  id: string;
  name: string;
  phone?: string;
  isActive: boolean;
  createdAt: FirebaseFirestore.Timestamp;
  updatedAt: FirebaseFirestore.Timestamp;
}

export interface Customer {
  id: string;
  kiotVietId: number;
  code: string;
  name: string;
  phone?: string;
  address?: string;
  debt?: number;
  isActive: boolean;
  lastSyncAt: FirebaseFirestore.Timestamp;
  createdAt: FirebaseFirestore.Timestamp;
  updatedAt: FirebaseFirestore.Timestamp;
}

export interface CashRecord {
  id: string;
  date: string;
  customerId?: string;
  customerName: string;
  customerCode?: string;
  amount: number;
  collectorId: string;
  collectorName: string;
  notes?: string;
  checkActualReceived: boolean;
  checkKiotVietEntered: boolean;
  rpaStatus?: 'pending' | 'success' | 'failed';
  rpaError?: string;
  rpaSyncAt?: FirebaseFirestore.Timestamp;
  createdBy: string;
  createdByName: string;
  createdAt: FirebaseFirestore.Timestamp;
  updatedAt: FirebaseFirestore.Timestamp;
  updatedBy?: string;
}
