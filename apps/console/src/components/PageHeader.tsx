export default function PageHeader({ title, subtitle, eyebrow }: {
  title: string;
  subtitle: string;
  eyebrow?: string;
}) {
  return <div className="page-heading">
    <div>{eyebrow && <p className="eyebrow">{eyebrow}</p>}<h1>{title}</h1><p className="page-subtitle">{subtitle}</p></div>
  </div>;
}
