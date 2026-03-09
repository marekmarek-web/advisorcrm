import Image from "next/image";

interface IllustrationProps {
  name: string;
  width?: number;
  height?: number;
  className?: string;
  alt?: string;
}

export function Illustration({
  name,
  width = 120,
  height = 120,
  className = "",
  alt = "",
}: IllustrationProps) {
  return (
    <Image
      src={`/illustrations/${name}.svg`}
      width={width}
      height={height}
      alt={alt || name}
      className={className}
      style={{ objectFit: "contain" }}
    />
  );
}
