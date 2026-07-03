/**
 * ATELIER COUTURE Types Definition
 */

export type ScreenType = 
  | 'landing' 
  | 'select-allocation' 
  | 'sold-out'
  | 'customer-auth'
  | 'my-tickets'
  | 'registration' 
  | 'checkout' 
  | 'confirmed' 
  | 'admin';

export type TicketType = 'ordinary' | 'vip';

export interface TicketPackage {
  id: TicketType;
  name: string;
  price: number;
  remaining: number;
  totalCap: number;
  benefits: string[];
  description: string;
}

export interface RegistrationData {
  fullName: string;
  email: string;
  phone: string;
  quantity: number;
  ticketType: TicketType;
}

export interface PaymentData {
  method: 'card' | 'mobilemoney';
  reference: string;
  providerReference?: string;
  status: 'pending' | 'completed' | 'failed';
}

export interface Transaction {
  id: string;
  fullName: string;
  initials: string;
  ticketType: TicketType;
  quantity: number;
  amount: number;
  timestamp: string; // e.g. "2 MINS AGO" or exact time
  status: 'pending' | 'completed' | 'failed';
  seatDetails: string[]; // e.g., ["Row A, 12", "Row A, 13"]
}

export interface AdminStats {
  ticketsSold: number;
  ticketsTotal: number;
  totalRevenue: number;
  remainingInventory: {
    ordinary: number;
    vip: number;
  };
  transactions: Transaction[];
  chartsData: {
    day: string;
    count: number;
    revenue: number;
  }[];
}
