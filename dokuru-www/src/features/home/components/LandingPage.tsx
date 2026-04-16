import { Navbar } from "./Navbar";
import { HeroSection } from "./HeroSection";
import { TechStackSection } from "./TechStackSection";
import { FeaturesSection } from "./FeaturesSection";
import { Footer } from "./Footer";

export function LandingPage() {
  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <HeroSection />
      <TechStackSection />
      <FeaturesSection />
      <Footer />
    </div>
  );
}
