// MetaMask sign-in. The wallet signs a one-time message; the backend returns a session token.
import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { BrowserProvider } from "ethers";
import { api, getToken, setToken } from "./api.js";

const WalletContext = createContext(null);

export function WalletProvider({ children }) {
  const [user, setUser] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!getToken()) return;
    api("/auth/me").then((d) => setUser(d.user)).catch(() => setToken(null));
  }, []);

  const signIn = useCallback(async (name) => {
    setError("");
    if (!window.ethereum) { setError("MetaMask not found. Install it to sign in."); return; }
    setBusy(true);
    try {
      const provider = new BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();
      const address = await signer.getAddress();
      const { message } = await api("/auth/nonce", { method: "POST", body: { address } });
      const signature = await signer.signMessage(message);
      const d = await api("/auth/login", { method: "POST", body: { address, signature, name } });
      setToken(d.token);
      setUser(d.user);
    } catch (e) {
      setError(e.shortMessage || e.message);
    } finally {
      setBusy(false);
    }
  }, []);

  const signOut = useCallback(() => { setToken(null); setUser(null); }, []);

  return <WalletContext.Provider value={{ user, busy, error, signIn, signOut }}>{children}</WalletContext.Provider>;
}

export const useWallet = () => useContext(WalletContext);
