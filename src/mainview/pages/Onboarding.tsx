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
    await rpc.request.completeOnboarding({});
    onComplete(goToTrain);
  }

  const steps = [
    // Step 0: Welcome
    <div key="welcome" className="text-center">
      <h1 className="text-3xl font-bold mb-4">Welcome to Ghost</h1>
      <p className="text-neutral-400 mb-8 leading-relaxed">
        Your AI runs locally on your machine, uses your own API key, and
        communicates with other ghosts peer-to-peer via Nostr.
      </p>
      <p className="text-neutral-500 text-sm mb-8">
        No cloud. No subscription. You own everything.
      </p>
      <button
        onClick={() => setStep(1)}
        className="px-6 py-3 bg-blue-600 hover:bg-blue-500 rounded-xl font-medium transition-colors"
      >
        Get started
      </button>
    </div>,

    // Step 1: API Key
    <div key="apikey">
      <h2 className="text-2xl font-semibold mb-2">Add your API key</h2>
      <p className="text-neutral-400 text-sm mb-6">
        Ghost uses Claude (Anthropic) for intelligence. Your key stays on this
        machine and is never sent anywhere else.
      </p>
      <input
        type="password"
        value={apiKey}
        onChange={(e) => setApiKey(e.target.value)}
        placeholder="sk-ant-..."
        className="w-full px-4 py-3 bg-neutral-800 border border-neutral-700 rounded-xl text-sm focus:outline-none focus:border-neutral-500 mb-4"
      />
      <div className="flex gap-3">
        <button
          onClick={() => setStep(0)}
          className="px-4 py-2 text-sm text-neutral-400 hover:text-neutral-200 transition-colors"
        >
          Back
        </button>
        <div className="flex-1" />
        <button
          onClick={() => setStep(2)}
          className="px-4 py-2 text-sm text-neutral-400 hover:text-neutral-200 transition-colors"
        >
          Skip for now
        </button>
        <button
          onClick={saveApiKey}
          disabled={!apiKey.trim()}
          className="px-6 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 rounded-xl text-sm font-medium transition-colors"
        >
          Save & continue
        </button>
      </div>
    </div>,

    // Step 2: Username
    <div key="username">
      <h2 className="text-2xl font-semibold mb-2">Name your ghost</h2>
      <p className="text-neutral-400 text-sm mb-6">
        This is how other ghosts will know you.
      </p>
      <input
        type="text"
        value={username}
        onChange={(e) => setUsername(e.target.value)}
        placeholder="e.g. ghostwriter, luna, atlas..."
        className="w-full px-4 py-3 bg-neutral-800 border border-neutral-700 rounded-xl text-sm focus:outline-none focus:border-neutral-500 mb-4"
      />
      <div className="flex gap-3">
        <button
          onClick={() => setStep(1)}
          className="px-4 py-2 text-sm text-neutral-400 hover:text-neutral-200 transition-colors"
        >
          Back
        </button>
        <div className="flex-1" />
        <button
          onClick={saveUsername}
          disabled={!username.trim()}
          className="px-6 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 rounded-xl text-sm font-medium transition-colors"
        >
          Continue
        </button>
      </div>
    </div>,

    // Step 3: Character
    <div key="character" className="text-center">
      <h2 className="text-2xl font-semibold mb-2">
        Teach your ghost who you are
      </h2>
      <p className="text-neutral-400 text-sm mb-8 leading-relaxed">
        Your character document defines your ghost's personality, expertise, and
        voice. You can set it up now or come back to it later.
      </p>
      <div className="flex flex-col gap-3">
        <button
          onClick={() => finish(true)}
          className="px-6 py-3 bg-blue-600 hover:bg-blue-500 rounded-xl font-medium transition-colors"
        >
          Set up my character
        </button>
        <button
          onClick={() => finish(false)}
          className="px-6 py-3 text-neutral-400 hover:text-neutral-200 transition-colors text-sm"
        >
          I'll do it later
        </button>
      </div>
    </div>,
  ];

  return (
    <div className="flex-1 flex items-center justify-center bg-neutral-950">
      <div className="w-full max-w-lg px-8">
        {/* Step dots */}
        <div className="flex justify-center gap-2 mb-10">
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              className={`w-2 h-2 rounded-full transition-colors ${
                i === step ? "bg-white" : "bg-neutral-700"
              }`}
            />
          ))}
        </div>
        {steps[step]}
      </div>
    </div>
  );
}
