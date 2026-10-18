const DocumentModel = require('./document.model');
const AdminModel = require('../admin/admin.model');

class DocumentService {
  static getActiveCatalog() {
    return DocumentModel.findAllActive();
  }

  static getAllDocumentTypes() {
    return DocumentModel.findAll();
  }

  static getDocumentType(id) {
    const doc = DocumentModel.findById(id);
    if (!doc) {
      throw new Error('Document type not found.');
    }
    return doc;
  }

  static createDocumentType(adminUser, data) {
    if (!data.name || !data.code) {
      throw new Error('Document code and name are required.');
    }

    const existing = DocumentModel.findByCode(data.code);
    if (existing) {
      throw new Error(`A document type with code "${data.code}" already exists.`);
    }

    const created = DocumentModel.create(data);

    AdminModel.logAudit(
      adminUser.id,
      adminUser.full_name || adminUser.fullName,
      'CREATE_DOCUMENT_TYPE',
      'document_types',
      created.id,
      `Created document type: ${created.name} (${created.code})`
    );

    return created;
  }

  static updateDocumentType(adminUser, id, data) {
    const existing = DocumentModel.findById(id);
    if (!existing) {
      throw new Error('Document type not found.');
    }

    const updated = DocumentModel.update(id, data);

    AdminModel.logAudit(
      adminUser.id,
      adminUser.full_name || adminUser.fullName,
      'UPDATE_DOCUMENT_TYPE',
      'document_types',
      id,
      `Updated document type: ${updated.name}`
    );

    return updated;
  }

  static deleteDocumentType(adminUser, id) {
    const existing = DocumentModel.findById(id);
    if (!existing) {
      throw new Error('Document type not found.');
    }

    DocumentModel.delete(id);

    AdminModel.logAudit(
      adminUser.id,
      adminUser.full_name || adminUser.fullName,
      'DELETE_DOCUMENT_TYPE',
      'document_types',
      id,
      `Deleted document type: ${existing.name}`
    );

    return true;
  }
}

module.exports = DocumentService;

