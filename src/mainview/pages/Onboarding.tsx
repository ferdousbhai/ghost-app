import { useState } from "react";
import { rpc } from "../rpc";

type OnboardingProps = {
  onComplete: (goToTrain?: boolean) => void;
};

export function Onboarding({ onComplete }: OnboardingProps) {
  const [step, setStep] = useState(0);
  const [apiKey, setApiKey] = useState("");
  const [username, setUsername] = useState("");

  async function saveApiKey() {
    if (apiKey.trim()) {
      await rpc.request.setConfig({ key: "api_key", value: apiKey.trim() });
    }
    setStep(2);
  }

  async function saveUsername() {
    if (username.trim()) {
      await rpc.request.setConfig({ key: "username", value: username.trim() });
    }
    setStep(3);
  }

  async function finish(goToTrain: boolean) {
    // Auto-generate Nostr keypair if not already set
    const identity = await rpc.request.getIdentity({});
    if (!identity) {
      await rpc.request.generateKeypair({});
    }
    await rpc.request.completeOnboarding({});
    onComplete(goToTrain);
  }

  const totalSteps = 4;

  const steps = [
    // Step 0: Welcome
    <div key="welcome" className="text-center animate-slide-up" style={{ animationDelay: '0.1s', animationFillMode: 'both' }}>
      {/* Spectral orb */}
      <div className="w-24 h-24 mx-auto mb-8 rounded-full bg-ghost-amber/5 border border-ghost-amber/10 animate-soul-breathe" />
      <h1 className="text-4xl font-display text-amber-glow tracking-tight mb-4">
        Ghost
      </h1>
      <p className="text-white/60 mb-8 leading-relaxed font-body animate-slide-up" style={{ animationDelay: '0.2s', animationFillMode: 'both' }}>
        Your AI runs locally on your machine, uses your own API key, and
        communicates with other ghosts peer-to-peer via Nostr.
      </p>
      <p className="text-ghost-muted text-sm mb-8 font-body animate-slide-up" style={{ animationDelay: '0.3s', animationFillMode: 'both' }}>
        No cloud. No subscription. You own everything.
      </p>
      <button
        onClick={() => setStep(1)}
        className="btn-primary px-8 py-3 text-sm animate-slide-up"
        style={{ animationDelay: '0.4s', animationFillMode: 'both' }}
      >
        Get started
      </button>
    </div>,

    // Step 1: API Key
    <div key="apikey" className="animate-slide-up" style={{ animationDelay: '0.1s', animationFillMode: 'both' }}>
      <h2 className="text-2xl font-display tracking-tight mb-2">Add your API key</h2>
      <p className="text-ghost-muted text-sm mb-6 font-body animate-slide-up" style={{ animationDelay: '0.2s', animationFillMode: 'both' }}>
        Ghost uses Claude (Anthropic) for intelligence. Your key stays on this
        machine and is never sent anywhere else.
      </p>
      <div className="animate-slide-up" style={{ animationDelay: '0.3s', animationFillMode: 'both' }}>
        <input
          type="password"
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          placeholder="sk-ant-..."
          className="glass-input w-full px-4 py-3 text-sm font-body mb-4"
        />
      </div>
      <div className="flex gap-3 animate-slide-up" style={{ animationDelay: '0.4s', animationFillMode: 'both' }}>
        <button
          onClick={() => setStep(0)}
          className="btn-ghost px-4 py-2 text-sm"
        >
          Back
        </button>
        <div className="flex-1" />
        <button
          onClick={() => setStep(2)}
          className="btn-ghost px-4 py-2 text-sm"
        >
          Skip for now
        </button>
        <button
          onClick={saveApiKey}
          disabled={!apiKey.trim()}
          className="btn-primary px-6 py-2 text-sm"
        >
          Save & continue
        </button>
      </div>
    </div>,

    // Step 2: Username
    <div key="username" className="animate-slide-up" style={{ animationDelay: '0.1s', animationFillMode: 'both' }}>
      <h2 className="text-2xl font-display tracking-tight mb-2">Name your ghost</h2>
      <p className="text-ghost-muted text-sm mb-6 font-body animate-slide-up" style={{ animationDelay: '0.2s', animationFillMode: 'both' }}>
        This is how other ghosts will know you.
      </p>
      <div className="animate-slide-up" style={{ animationDelay: '0.3s', animationFillMode: 'both' }}>
        <input
          type="text"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          placeholder="e.g. ghostwriter, luna, atlas..."
          className="glass-input w-full px-4 py-3 text-sm font-body mb-4"
        />
      </div>
      <div className="flex gap-3 animate-slide-up" style={{ animationDelay: '0.4s', animationFillMode: 'both' }}>
        <button
          onClick={() => setStep(1)}
          className="btn-ghost px-4 py-2 text-sm"
        >
          Back
        </button>
        <div className="flex-1" />
        <button
          onClick={saveUsername}
          disabled={!username.trim()}
          className="btn-primary px-6 py-2 text-sm"
        >
          Continue
        </button>
      </div>
    </div>,

    // Step 3: Character
    <div key="character" className="text-center animate-slide-up" style={{ animationDelay: '0.1s', animationFillMode: 'both' }}>
      <h2 className="text-2xl font-display tracking-tight mb-2 animate-slide-up" style={{ animationDelay: '0.15s', animationFillMode: 'both' }}>
        Teach your ghost who you are
      </h2>
      <p className="text-ghost-muted text-sm mb-8 leading-relaxed font-body animate-slide-up" style={{ animationDelay: '0.25s', animationFillMode: 'both' }}>
        Your character document defines your ghost's personality, expertise, and
        voice. You can set it up now or come back to it later.
      </p>
      <div className="flex flex-col gap-3 animate-slide-up" style={{ animationDelay: '0.35s', animationFillMode: 'both' }}>
        <button
          onClick={() => finish(true)}
          className="btn-primary px-6 py-3 text-sm"
        >
          Set up my character
        </button>
        <button
          onClick={() => finish(false)}
          className="btn-ghost px-6 py-3 text-sm"
        >
          I'll do it later
        </button>
      </div>
    </div>,
  ];

  return (
    <div className="flex-1 flex items-center justify-center relative" style={{ background: 'var(--ghost-bg)' }}>
      {/* Ambient background */}
      <div className="ambient-bg">
        <div className="ambient-blob ambient-blob-1" />
        <div className="ambient-blob ambient-blob-2" />
        <div className="ambient-blob ambient-blob-3" />
      </div>

      <div className="w-full max-w-lg px-8 relative z-10">
        {/* Glass card */}
        <div className="glass-card p-10">
          {/* Step dots */}
          <div className="flex justify-center gap-2 mb-10">
            {Array.from({ length: totalSteps }, (_, i) => (
              <div
                key={i}
                className={`w-2 h-2 rounded-full transition-all duration-300 ${
                  i === step
                    ? "bg-ghost-amber"
                    : i < step
                    ? "bg-ghost-amber/40"
                    : "bg-white/10"
                }`}
                style={i === step ? { animation: 'step-dot-glow 2s ease-in-out infinite' } : undefined}
              />
            ))}
          </div>
          {steps[step]}
        </div>
      </div>
    </div>
  );
}
