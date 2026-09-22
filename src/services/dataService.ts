import { apiFetch } from '../lib/api';

const post = (endpoint: string, body: any) =>
  apiFetch(endpoint, { method: 'POST', body: JSON.stringify(body) });

export const DataService = {
  approveWaybill(waybillId: string, actorId: string) {
    return post('/api/action/approveWaybill', { waybillId, actorId });
  },

  approveReport(reportId: string, actorId: string) {
    return post('/api/action/approveReport', { reportId, actorId });
  },

  decideRequisition(requisitionId: string, actorId: string, decision: 'approve' | 'reject', comment?: string) {
    return post('/api/action/decideRequisition', { requisitionId, actorId, decision, comment });
  },

  addInvoice(invoiceData: any) {
    return post('/api/action/addInvoice', invoiceData);
  },

  addStock(holderId: string, items: any[]) {
    return post('/api/action/addStock', { holderId, items });
  },

  getMe(id: string) {
    return apiFetch(`/api/auth/me/${id}`);
  },

  // CRUD Helpers
  getCollection(name: string) {
    return apiFetch(`/api/data/${name}`);
  },

  addToCollection(name: string, data: any) {
    return post(`/api/data/${name}`, data);
  },

  updateInCollection(name: string, id: string, data: any) {
    return apiFetch(`/api/data/${name}/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data)
    });
  },

  removeFromCollection(name: string, id: string) {
    return apiFetch(`/api/data/${name}/${id}`, {
      method: 'DELETE'
    });
  }
};
