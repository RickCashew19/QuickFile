const VerificationService = require('./verification.service');

class VerificationController {
  static renderVerificationPage(req, res) {
    const code = req.query.code || req.params.code || null;
    let result = null;

    if (code) {
      try {
        result = VerificationService.verifyDocument(code);
      } catch (err) {
        result = {
          isValid: false,
          found: false,
          searchedCode: code,
          message: err.message
        };
      }
    }

    if (req.xhr || req.headers.accept?.includes('application/json')) {
      return res.json({ success: true, ...result });
    }

    res.render('verification/verify', {
      title: 'QR Document Verification - Barangay Central QuickFile',
      searchedCode: code || '',
      result
    });
  }
}

module.exports = VerificationController;
