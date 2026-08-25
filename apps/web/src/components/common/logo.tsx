import { Link } from "@tanstack/react-router";
import useProjectStore from "@/store/project";

type LogoProps = {
  className?: string;
};

export function Logo({ className = "" }: LogoProps) {
  const { setProject } = useProjectStore();

  return (
    <Link
      onClick={() => {
        setProject(undefined);
      }}
      to="/dashboard"
      className={`w-auto ${className}`}
    >
      <img
        src="/logo-dark.svg"
        alt="Kaneo"
        className="h-6 w-auto bp:hidden dark:hidden"
      />
      <img
        src="/logo-light.svg"
        alt="Kaneo"
        className="hidden h-6 w-auto bp:hidden dark:block"
      />
      <img
        src="/logo-bp.svg"
        alt="BusinessPad"
        className="hidden h-6 w-auto bp:block"
      />
    </Link>
  );
}
