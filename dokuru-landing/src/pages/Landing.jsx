import React from "react";
import Header from "../components/landing/Header";
import Hero from "../components/landing/Hero";
import Problem from "../components/landing/Problem";
import Features from "../components/landing/Features";
import HowItWorks from "../components/landing/HowItWorks";
import Coverage from "../components/landing/Coverage";
import WhyDokuru from "../components/landing/WhyDokuru";
import UseCases from "../components/landing/UseCases";
import FinalCTA from "../components/landing/FinalCTA";
import Footer from "../components/landing/Footer";

const Landing = () => {
  return (
    <div
      data-testid="landing-root"
      className="min-h-screen bg-[#050505] text-white selection:bg-[#2496ED]/30 overflow-x-hidden"
    >
      <Header />
      <main>
        <Hero />
        <Problem />
        <Features />
        <HowItWorks />
        <Coverage />
        <WhyDokuru />
        <UseCases />
        <FinalCTA />
      </main>
      <Footer />
    </div>
  );
};

export default Landing;
