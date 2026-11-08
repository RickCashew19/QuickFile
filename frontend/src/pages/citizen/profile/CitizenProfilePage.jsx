import { useState, useEffect } from 'react';
import { citizenService } from '../../../services/citizenService';
import { useAuth } from '../../../hooks/useAuth';
import { validateProfileForm } from '../../../utils/validators';
import { ProfileCompletenessBar } from './ProfileCompletenessBar';
import { ProfileFormFields } from './ProfileFormFields';
import { Button } from '../../../components/shared/Button';
import { Alert } from '../../../components/shared/Alert';
import { Loader } from '../../../components/shared/Loader';
import { Icon } from '../../../components/shared/Icon';
import './CitizenProfilePage.css';

export function CitizenProfilePage() {
  const { refreshUser } = useAuth();

  const [formData, setFormData] = useState({});
  const [initialData, setInitialData] = useState({});
  const [completenessScore, setCompletenessScore] = useState(0);

  const [isEditing, setIsEditing] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [errors, setErrors] = useState({});
  const [statusMessage, setStatusMessage] = useState(null);

  useEffect(() => {
    async function loadProfile() {
      setIsLoading(true);
      try {
        const response = await citizenService.getProfile();
        const profile = response?.profile || {};
        setFormData(profile);
        setInitialData(profile);
        setCompletenessScore(response?.completeness_score || 0);
      } catch (err) {
        setStatusMessage({ type: 'danger', text: err.message || 'Failed to load profile.' });
      } finally {
        setIsLoading(false);
      }
    }
    loadProfile();
  }, []);

  const handleFieldChange = (field, value) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    if (errors[field]) {
      setErrors((prev) => ({ ...prev, [field]: null }));
    }
  };

  const handleCancelEdit = () => {
    setFormData(initialData);
    setErrors({});
    setIsEditing(false);
    setStatusMessage(null);
  };

  const handleSaveProfile = async (e) => {
    e.preventDefault();
    setStatusMessage(null);

    const validation = validateProfileForm(formData);
    if (!validation.isValid) {
      setErrors(validation.errors);
      setStatusMessage({ type: 'danger', text: 'Please resolve required profile fields before saving.' });
      return;
    }
    setErrors({});

    setIsSaving(true);
    try {
      const response = await citizenService.updateProfile(formData);
      const updatedProfile = response?.profile || formData;
      setFormData(updatedProfile);
      setInitialData(updatedProfile);
      setCompletenessScore(response?.completeness_score || 0);
      setIsEditing(false);
      setStatusMessage({ type: 'success', text: 'Your citizen profile has been updated successfully.' });
      await refreshUser();
    } catch (err) {
      setStatusMessage({ type: 'danger', text: err.message || 'Failed to update profile.' });
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="qf-profile-loading">
        <Loader size="lg" text="Loading citizen profile..." />
      </div>
    );
  }

  return (
    <div className="qf-profile-page">
      <div className="qf-profile-header">
        <div>
          <h1 className="qf-profile-title">Citizen Profile</h1>
          <p className="qf-profile-subtitle">
            Manage your personal data, address details, and identity documents.
          </p>
        </div>

        {!isEditing && (
          <Button
            variant="primary"
            onClick={() => setIsEditing(true)}
            iconLeft={<Icon name="edit" size={16} />}
          >
            Edit Profile
          </Button>
        )}
      </div>

      {statusMessage && (
        <Alert variant={statusMessage.type} onDismiss={() => setStatusMessage(null)}>
          {statusMessage.text}
        </Alert>
      )}

      <ProfileCompletenessBar score={completenessScore} />

      <form onSubmit={handleSaveProfile} noValidate>
        <ProfileFormFields
          formData={formData}
          onChange={handleFieldChange}
          errors={errors}
          isEditing={isEditing}
        />

        {isEditing && (
          <div className="qf-profile-actions">
            <Button
              type="button"
              variant="secondary"
              onClick={handleCancelEdit}
              disabled={isSaving}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              loading={isSaving}
              iconLeft={<Icon name="check" size={16} />}
            >
              Save Profile Changes
            </Button>
          </div>
        )}
      </form>
    </div>
  );
}
