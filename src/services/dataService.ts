import { apiFetch } from '../lib/api';
import { 
  Waybill, 
  TechnicalReport,
} from '../types';

export const DataService = {
  async approveWaybill(waybill: Waybill) {
    return apiFetch('/api/action/approveWaybill', {
      method: 'POST',
      body: JSON.stringify({ waybillId: waybill.id })
    });
  },

  async approveTechReport(report: TechnicalReport) {
    return apiFetch('/api/action/approveTechReport', {
      method: 'POST',
      body: JSON.stringify({ reportId: report.id })
    });
  },

  async addInvoice(invoiceData: any) {
    return apiFetch('/api/action/addInvoice', {
      method: 'POST',
      body: JSON.stringify(invoiceData)
    });
  },

  // CRUD Helpers
  async getCollection(name: string) {
    return apiFetch(`/api/data/${name}`);
  },

  async addToCollection(name: string, data: any) {
    return apiFetch(`/api/data/${name}`, {
      method: 'POST',
      body: JSON.stringify(data)
    });
  },

  async updateInCollection(name: string, id: string, data: any) {
    return apiFetch(`/api/data/${name}/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data)
    });
  },

  async removeFromCollection(name: string, id: string) {
    return apiFetch(`/api/data/${name}/${id}`, {
      method: 'DELETE'
    });
  }
};
