"use client";

import { useEffect, useState } from "react";

const images = [
  "https://picsum.photos/seed/hero1/1200/400",
  "https://picsum.photos/seed/hero2/1200/400",
  "https://picsum.photos/seed/hero3/1200/400",
];

export default function HeroSlider() {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setIndex((prev) => (prev + 1) % images.length);
    }, 4000);

    return () => clearInterval(timer);
  }, []);

  return (
    <div className="relative h-64 overflow-hidden">
      {images.map((src, i) => (
        <img
          key={i}
          src={src}
          alt=""
          className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-1000 ${
            i === index ? "opacity-100" : "opacity-0"
          }`}
        />
      ))}

      <div className="absolute inset-0 bg-black/30 flex items-center justify-center">
        <h1 className="text-white text-3xl font-bold">
          Welcome to Our Store
        </h1>
      </div>
    </div>
  );
}
