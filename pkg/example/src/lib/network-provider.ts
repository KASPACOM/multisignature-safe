import { BrowserProvider, Eip1193Provider, ethers } from "ethers";
import {
  Network,
  WalletState,
  ConnectionStatus,
  WalletEvent,
  NetworkConfig,
  WALLET_TRANSITIONS,
} from "./network-types";
import { getSupportedNetworks } from "./constants";

type Eth = Eip1193Provider & {
  on: (e: string, l: (...a: any[]) => void) => void;
  request?: (o: { method: string; params: any[] }) => Promise<any>;
};

declare let window: Window & { ethereum?: Eth };

let wallet: Eth;

export class NetworkProvider {
  private currentStatus: ConnectionStatus = {
    state: WalletState.Disconnected,
    isLoading: false,
  };

  // Callbacks for notification of state changes
  private statusCallbacks: Set<(status: ConnectionStatus) => void> = new Set();

  // Supported networks
  private supportedNetworks: Map<bigint, NetworkConfig> = new Map();

  constructor() {
    if (typeof window !== "undefined" && window.ethereum) {
      this.detectProvider();
    }
    this.initializeSupportedNetworks();
  }

  // Initialize supported networks
  private initializeSupportedNetworks() {
    const networks = getSupportedNetworks();

    networks.forEach((networkConfig) => {
      this.supportedNetworks.set(BigInt(networkConfig.chainId), {
        chainId: BigInt(networkConfig.chainId),
        name: networkConfig.name,
        rpcUrl: networkConfig.rpcUrl,
        contracts: networkConfig.contracts,
      });
    });
  }

  // Subscribe to state changes
  onStatusChange(callback: (status: ConnectionStatus) => void): () => void {
    this.statusCallbacks.add(callback);

    // Immediately call callback with the current state
    callback(this.currentStatus);

    // Return function for unsubscribing
    return () => {
      this.statusCallbacks.delete(callback);
    };
  }

  // Process event and state transition
  private processEvent(event: WalletEvent) {
    console.log("NetworkProvider: Processing event:", event.type, event);
    console.log("Current state:", this.currentStatus.state);

    // Find suitable transition
    const transition = WALLET_TRANSITIONS.find(
      (t) =>
        t.from === this.currentStatus.state &&
        t.trigger === event.type &&
        (!t.condition || t.condition(this.currentStatus, event))
    );

    if (!transition) {
      console.warn("NetworkProvider: Transition not found for:", {
        from: this.currentStatus.state,
        trigger: event.type,
      });
      return;
    }

    console.log(
      "NetworkProvider: Transition:",
      `${transition.from} → ${transition.to}`
    );

    // Update state based on event
    this.updateStatus(transition.to, event);
  }

  // Update state and notify subscribers
  private updateStatus(newState: WalletState, event?: WalletEvent) {
    const previousState = this.currentStatus.state;

    this.currentStatus = {
      ...this.currentStatus,
      state: newState,
      isLoading: this.isLoadingState(newState),
    };

    // Update additional fields based on event
    if (event) {
      switch (event.type) {
        case "CONNECTION_SUCCESS":
          if ("network" in event && "account" in event) {
            this.currentStatus.network = event.network;
            this.currentStatus.account = event.account;
            this.currentStatus.error = undefined;
          }
          break;

        case "CONNECTION_ERROR":
          if ("error" in event) {
            this.currentStatus.error = event.error;
            this.currentStatus.network = undefined;
            this.currentStatus.account = undefined;
          }
          break;

        case "DISCONNECTED":
          this.currentStatus.network = undefined;
          this.currentStatus.account = undefined;
          this.currentStatus.error = undefined;
          break;
      }
    }

    console.log("NetworkProvider: State updated:", {
      previous: previousState,
      current: this.currentStatus.state,
      hasNetwork: !!this.currentStatus.network,
      hasAccount: !!this.currentStatus.account,
    });

    // Notify all subscribers
    this.statusCallbacks.forEach((callback) => {
      try {
        callback({ ...this.currentStatus });
      } catch (error) {
        console.error("NetworkProvider: Error in callback:", error);
      }
    });
  }

  // Check if state is loading
  private isLoadingState(state: WalletState): boolean {
    return state === WalletState.Connecting;
  }

  // Detect provider
  private detectProvider() {
    if (typeof window !== "undefined" && window.ethereum) {
      wallet = window.ethereum as Eth;
      console.log("NetworkProvider: MetaMask detected");

      const provider = new ethers.BrowserProvider(wallet);
      this.processEvent({ type: "PROVIDER_DETECTED", provider });

      // Subscribe to MetaMask events
      this.setupEventListeners();
    } else {
      console.log("NetworkProvider: MetaMask not found");
      this.updateStatus(WalletState.Disconnected);
    }
  }

  // Setup MetaMask event listeners
  private setupEventListeners() {
    if (!wallet) return;

    // Account change
    wallet.on("accountsChanged", (accounts: string[]) => {
      console.log("NetworkProvider: Accounts changed:", accounts);

      if (accounts.length === 0) {
        this.processEvent({ type: "DISCONNECTED" });
      } else {
        this.processEvent({ type: "ACCOUNT_CHANGED", account: accounts[0] });
        // After account change, try to reconnect
        this.refresh();
      }
    });

    // Network change
    wallet.on("chainChanged", (chainIdHex: string) => {
      const chainId = BigInt(chainIdHex);
      console.log("NetworkProvider: Network changed:", chainId.toString());

      this.processEvent({ type: "NETWORK_CHANGED", chainId });
      // After network change, try to reconnect
      this.refresh();
    });

    // Disconnect
    wallet.on("disconnect", () => {
      console.log("NetworkProvider: Disconnect");
      this.processEvent({ type: "DISCONNECTED" });
    });
  }

  // Main method for connecting to wallet
  async connect(): Promise<Network> {
    console.log("NetworkProvider: Connect request...");

    this.processEvent({ type: "CONNECT_REQUESTED" });

    try {
      // Update wallet in case it became available
      if (typeof window !== "undefined" && window.ethereum) {
        wallet = window.ethereum as Eth;
      }

      if (!wallet) {
        throw new Error("MetaMask not installed!");
      }

      // Create provider and get access to accounts
      const provider = new ethers.BrowserProvider(wallet);

      // Request access to accounts
      await provider.send("eth_requestAccounts", []);

      // Get signer and network information
      const signer = await provider.getSigner();
      const network = await provider.getNetwork();
      const account = await signer.getAddress();

      console.log("NetworkProvider: Connection successful:", {
        chainId: network.chainId.toString(),
        account,
      });

      // Check if network is supported
      if (!this.supportedNetworks.has(network.chainId)) {
        throw new Error(`Network ${network.chainId} not supported`);
      }

      // Create Network object
      const networkInstance: Network = {
        id: network.chainId,
        provider: provider,
        signer,
        eip1193Provider: wallet, // Save original window.ethereum
      };

      this.processEvent({
        type: "CONNECTION_SUCCESS",
        network: networkInstance,
        account,
      });

      return networkInstance;
    } catch (error: any) {
      console.error("NetworkProvider: Connection error:", error);

      this.processEvent({
        type: "CONNECTION_ERROR",
        error: error.message || "Connection error to wallet",
      });

      throw error;
    }
  }

  // Update current connection (for reconnection)
  async refresh(): Promise<Network | null> {
    console.log("NetworkProvider: Update connection...");

    try {
      // Update wallet in case it changed
      if (typeof window !== "undefined" && window.ethereum) {
        wallet = window.ethereum as Eth;
      }

      if (!wallet) {
        this.processEvent({ type: "DISCONNECTED" });
        return null;
      }

      const provider: BrowserProvider = new ethers.BrowserProvider(wallet);

      // Check if there are connected accounts
      const accounts = await provider.listAccounts();
      if (accounts.length === 0) {
        this.processEvent({ type: "DISCONNECTED" });
        return null;
      }

      const signer = await provider.getSigner();
      const network = await provider.getNetwork();
      const account = await signer.getAddress();

      // Check if network is supported
      if (!this.supportedNetworks.has(network.chainId)) {
        this.processEvent({
          type: "CONNECTION_ERROR",
          error: `Network ${network.chainId} is not supported`,
        });
        return null;
      }

      const networkInstance: Network = {
        id: network.chainId,
        provider: provider,
        signer,
        eip1193Provider: wallet, // Save original window.ethereum
      };

      this.processEvent({
        type: "CONNECTION_SUCCESS",
        network: networkInstance,
        account,
      });

      return networkInstance;
    } catch (error: any) {
      console.error("NetworkProvider: Update error:", error);

      this.processEvent({
        type: "CONNECTION_ERROR",
        error: error.message || "Update error",
      });

      return null;
    }
  }

  // Disconnect from wallet
  disconnect() {
    console.log("NetworkProvider: Disconnect...");
    this.processEvent({ type: "DISCONNECTED" });
  }

  // Check connection
  isConnected(): boolean {
    return (
      this.currentStatus.state === WalletState.Connected &&
      !!this.currentStatus.network
    );
  }

  // Get network configuration by ID
  getNetworkConfig(chainId: bigint): NetworkConfig | undefined {
    return this.supportedNetworks.get(chainId);
  }

  // Get list of supported networks
  getSupportedNetworks(): NetworkConfig[] {
    return Array.from(this.supportedNetworks.values());
  }
}

export const networkProvider = new NetworkProvider();
