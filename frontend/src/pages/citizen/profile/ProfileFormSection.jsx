export function ProfileFormSection({ title, description, children }) {
  return (
    <section className="qf-profile-section">
      <div className="qf-profile-section__header">
        <h2 className="qf-profile-section__title">{title}</h2>
        {description && <p className="qf-profile-section__desc">{description}</p>}
      </div>
      <div className="qf-profile-section__grid">{children}</div>
    </section>
  );
}
