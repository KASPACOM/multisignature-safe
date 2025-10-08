import React, { useState, useEffect } from "react";
import { ethers } from "ethers";

import SafeOnChain, { SafeConnectionForm } from "../lib/onchain";
import UserProposals, { ProposalAction } from "./UserProposals";
import SafeOffChain, { UserProposal } from "../lib/offchain";
import { formatAddress } from "../lib/safe-common";
import { Network } from "../lib/network-types";

interface SafeInfo {
  address: string;
  owners: string[];
  threshold: number;
  balance: string;
  nonce: number;
}

interface UserProposalsStats {
  total: number;
  pending: number; // require user signature
  executable: number; // ready to execute
  executed: number; // already executed
  byStatus: {
    needsMySignature: number;
    waitingForOthers: number;
    readyToExecute: number;
    executed: number;
  };
}

interface ProposalsPageProps {
  network: Network | null;
  userAddress: string;
  safeOnChain: SafeOnChain | null;
  safeOffChain: SafeOffChain | null;
  safeInfo: SafeInfo | null;
  setSafeInfo: (info: SafeInfo | null) => void;
  showError: (message: string) => void;
  showSuccess: (message: string) => void;
  loadPendingTransactions?: (address: string) => Promise<void>;
  onNavigateToSafeCreation?: (
    safeAddress: string,
    owners: string[],
    threshold: number
  ) => void;
}

const ProposalsPage: React.FC<ProposalsPageProps> = ({
  network,
  userAddress,
  safeOnChain,
  safeOffChain,
  safeInfo,
  setSafeInfo,
  showError,
  showSuccess,
  loadPendingTransactions,
  onNavigateToSafeCreation,
}) => {
  // User proposals statistics state
  const [userProposalsStats, setUserProposalsStats] =
    useState<UserProposalsStats | null>(null);
  const [statsLoading, setStatsLoading] = useState<boolean>(false);
  const [userProposalsRefresh, setUserProposalsRefresh] = useState(0);

  // Proposals filter state
  const [proposalsFilter, setProposalsFilter] = useState<
    "all" | "needsSignature" | "readyToExecute" | "executed"
  >("all");

  // Safe contracts without proposals state
  const [safesWithoutProposals, setSafesWithoutProposals] = useState<string[]>(
    []
  );
  const [safesLoading, setSafesLoading] = useState<boolean>(false);

  // Load user proposals statistics
  const loadUserProposalsStats = async (address: string) => {
    if (!safeOffChain) return;

    console.log("Loading proposals statistics for:", address);
    setStatsLoading(true);

    try {
      const stats = await safeOffChain.getUserProposalsStats(address);
      setUserProposalsStats(stats);

      console.log("Proposals statistics loaded:", stats);

      // Show brief info to user if there are active tasks
      if (stats.pending > 0 || stats.executable > 0) {
        let message = "";
        if (stats.pending > 0) {
          message += `${stats.pending} proposals require your signature`;
        }
        if (stats.executable > 0) {
          if (message) message += ", ";
          message += `${stats.executable} ready to execute`;
        }
        showSuccess(`${message}`);
      }
    } catch (error) {
      console.error("Error loading proposals statistics:", error);
      // Don't show error to user as it's not critical
      setUserProposalsStats(null);
    } finally {
      setStatsLoading(false);
    }
  };

  // Load Safe contracts without proposals
  const loadSafesWithoutProposals = async (address: string) => {
    if (!safeOffChain) return;

    console.log("Loading Safe contracts without proposals for:", address);
    setSafesLoading(true);

    try {
      const safes = await safeOffChain.getUserSafes(address);
      setSafesWithoutProposals(safes);

      console.log("Safe contracts without proposals loaded:", safes.length);
    } catch (error) {
      console.error("Error loading Safe contracts:", error);
      setSafesWithoutProposals([]);
    } finally {
      setSafesLoading(false);
    }
  };

  // Handle user proposal actions
  const handleUserProposalAction = async (
    proposal: UserProposal,
    action: ProposalAction
  ) => {
    if (!safeOffChain) {
      showError("SafeOffChain not initialized");
      return;
    }

    console.log(`User proposal action: ${action}`, proposal.safeTxHash);

    try {
      switch (action) {
        case ProposalAction.SIGN:
          if (!safeOnChain) {
            showError("Safe Manager not initialized");
            return;
          }

          console.log("Checking Safe connection for signing:", proposal.safe);

          // Check if we're connected to the required Safe address
          const currentSafeAddressSign = safeInfo?.address?.toLowerCase();
          const requiredSafeAddressSign = proposal.safe.toLowerCase();

          if (currentSafeAddressSign !== requiredSafeAddressSign) {
            console.log(
              `Need to connect to Safe ${requiredSafeAddressSign}, current: ${
                currentSafeAddressSign || "not connected"
              }`
            );

            // Automatically connect to the required Safe
            try {
              // Get Safe information to create connection form
              const safeInfoFromSTS = await safeOffChain.getSafeInfo(
                proposal.safe
              );
              const connectionForm: SafeConnectionForm = {
                safeAddress: proposal.safe,
                owners: safeInfoFromSTS.owners,
                threshold: safeInfoFromSTS.threshold,
              };

              await safeOnChain.connectToSafeWithForm(connectionForm);

              // Update Safe information
              const safeData = await safeOnChain.getCurrentSafeInfo();
              setSafeInfo({
                address: safeData.address,
                owners: safeData.owners,
                threshold: safeData.threshold,
                balance: safeData.balance,
                nonce: safeData.nonce,
              });

              console.log("Connected to Safe for signing:", proposal.safe);
            } catch (connectError) {
              showError(
                `Failed to connect to Safe ${formatAddress(proposal.safe)}: ${
                  connectError instanceof Error
                    ? connectError.message
                    : "Unknown error"
                }`
              );
              return;
            }
          } else {
            console.log("Already connected to the required Safe for signing");
          }

          // Sign proposal via EIP-712 signature
          console.log("Signing proposal via EIP-712:", proposal.safeTxHash);

          if (!network) {
            showError("Network not connected");
            return;
          }

          try {
            // 1. Get transaction data from STS
            const stsTransaction = await safeOffChain.getTransaction(
              proposal.safeTxHash
            );

            // 2. Restore SafeTransaction from STS data
            // Convert value from STS (string in wei) to BigInt
            let valueFromSTS: bigint = 0n;
            if (stsTransaction.value && stsTransaction.value !== "0") {
              try {
                valueFromSTS = BigInt(stsTransaction.value);
                console.log(
                  "Converting value from STS to BigInt for signing:",
                  stsTransaction.value,
                  "→",
                  valueFromSTS.toString()
                );
              } catch (parseError) {
                console.error(
                  "Error parsing value from STS for signing:",
                  stsTransaction.value,
                  parseError
                );
                valueFromSTS = 0n;
              }
            }

            const safeTransaction = await safeOnChain.createSafeTransaction({
              to: stsTransaction.to,
              value: valueFromSTS,
              data: stsTransaction.data || "0x",
            });

            // Set nonce from STS
            if (stsTransaction.nonce !== undefined) {
              safeTransaction.data.nonce = parseInt(
                stsTransaction.nonce.toString()
              );
            }

            console.log(
              "Signing restored transaction via Safe SDK (EIP-712)..."
            );

            // 3. Sign transaction via Safe SDK (will call MetaMask)
            const safeSdk = safeOnChain.getSafeSdk();
            const signedSafeTransaction = await safeSdk.signTransaction(
              safeTransaction
            );

            // 4. Get user address and their signature
            const userAddress = await network.signer.getAddress();
            const userSignature =
              signedSafeTransaction.signatures.get(userAddress) ||
              signedSafeTransaction.signatures.get(userAddress.toLowerCase()) ||
              signedSafeTransaction.signatures.get(
                ethers.getAddress(userAddress)
              );

            if (!userSignature) {
              const availableKeys = Array.from(
                signedSafeTransaction.signatures.keys()
              );
              throw new Error(
                `Signature not found for address ${userAddress}. Available: ${availableKeys.join(
                  ", "
                )}`
              );
            }

            console.log(
              "EIP-712 signature created:",
              userSignature.data.slice(0, 20) + "..."
            );

            // 5. Send real signature to STS
            await safeOffChain.confirmTransaction(
              proposal.safeTxHash,
              userSignature.data
            );
            showSuccess("Proposal signed via EIP-712 and confirmed in STS!");
          } catch (signError: any) {
            console.error("EIP-712 signature error:", signError);
            showError(`Signature error: ${signError.message}`);
            return;
          }

          // Point update of proposal will happen automatically via UserProposals
          break;

        case ProposalAction.EXECUTE:
          if (!safeOnChain) {
            showError("Safe Manager not initialized");
            return;
          }

          console.log("Checking Safe connection:", proposal.safe);

          // Check if we're connected to the required Safe address
          const currentSafeAddress = safeInfo?.address?.toLowerCase();
          const requiredSafeAddress = proposal.safe.toLowerCase();

          if (currentSafeAddress !== requiredSafeAddress) {
            console.log(
              `Need to connect to Safe ${requiredSafeAddress}, current: ${
                currentSafeAddress || "not connected"
              }`
            );

            // Automatically connect to the required Safe
            try {
              // Get Safe information to create connection form
              const safeInfoFromSTS = await safeOffChain.getSafeInfo(
                proposal.safe
              );
              const connectionForm: SafeConnectionForm = {
                safeAddress: proposal.safe,
                owners: safeInfoFromSTS.owners,
                threshold: safeInfoFromSTS.threshold,
              };

              await safeOnChain.connectToSafeWithForm(connectionForm);

              // Update Safe information
              const safeData = await safeOnChain.getCurrentSafeInfo();
              setSafeInfo({
                address: safeData.address,
                owners: safeData.owners,
                threshold: safeData.threshold,
                balance: safeData.balance,
                nonce: safeData.nonce,
              });

              console.log("Connected to Safe:", proposal.safe);
            } catch (connectError) {
              showError(
                `Failed to connect to Safe ${formatAddress(proposal.safe)}: ${
                  connectError instanceof Error
                    ? connectError.message
                    : "Unknown error"
                }`
              );
              return;
            }
          } else {
            console.log("Already connected to the required Safe");
          }

          // Execute transaction via STS integration
          const txHash = await safeOnChain.executeTransactionByHash(
            proposal.safeTxHash,
            safeOffChain
          );
          showSuccess(`Proposal executed! Hash: ${formatAddress(txHash)}`);

          // Point update of proposal will happen automatically via UserProposals

          if (safeInfo) {
            // Update Safe information immediately
            const updatedSafeInfo = await safeOnChain.getCurrentSafeInfo();
            setSafeInfo({
              address: updatedSafeInfo.address,
              owners: updatedSafeInfo.owners,
              threshold: updatedSafeInfo.threshold,
              balance: updatedSafeInfo.balance,
              nonce: updatedSafeInfo.nonce,
            });

            // Update transaction list with delay
            if (loadPendingTransactions) {
              setTimeout(async () => {
                await loadPendingTransactions(safeInfo.address);
              }, 2000);
            }
          }
          break;

        case ProposalAction.VIEW:
          // Show detailed proposal information
          console.log("Proposal details:", proposal);
          showSuccess("Proposal details output to console");
          break;

        default:
          console.warn("Unknown action:", action);
      }
    } catch (error) {
      console.error(`Error executing action ${action}:`, error);
      showError(
        error instanceof Error
          ? error.message
          : `Error executing action ${action}`
      );
    }
  };

  // Handle Safe contract click
  const handleSafeClick = async (safeAddress: string) => {
    if (!safeOffChain) {
      showError("SafeOffChain not initialized");
      return;
    }

    console.log("Safe contract click:", safeAddress);

    try {
      // Get Safe information from STS
      const safeInfoFromSTS = await safeOffChain.getSafeInfo(safeAddress);

      console.log("Safe information:", {
        address: safeAddress,
        owners: safeInfoFromSTS.owners,
        threshold: safeInfoFromSTS.threshold,
      });

      // Navigate to Safe creation screen with filled data
      if (onNavigateToSafeCreation) {
        onNavigateToSafeCreation(
          safeAddress,
          safeInfoFromSTS.owners,
          safeInfoFromSTS.threshold
        );
      } else {
        showError("Safe creation navigation function not configured");
      }
    } catch (error) {
      console.error("Error getting Safe information:", error);
      showError(`Failed to get Safe information ${formatAddress(safeAddress)}`);
    }
  };

  // Update user proposals
  const refreshUserProposals = () => {
    setUserProposalsRefresh((prev) => prev + 1);

    // Also update proposals statistics and Safe contracts
    if (userAddress) {
      loadUserProposalsStats(userAddress);
      loadSafesWithoutProposals(userAddress);
    }
  };

  // Point update of a single proposal (passed to UserProposals)
  const handleSingleProposalUpdate = (safeTxHash: string) => {
    console.log("Point proposal update request:", safeTxHash);
    // Update logic will be in UserProposals component via updateSingleProposal
    // Here we can additionally update statistics
    if (userAddress) {
      setTimeout(() => {
        loadUserProposalsStats(userAddress);
      }, 2000); // Update statistics with delay
    }
  };

  // Load statistics and Safe contracts when user connects
  useEffect(() => {
    if (userAddress) {
      loadUserProposalsStats(userAddress);
      loadSafesWithoutProposals(userAddress);
    } else {
      setUserProposalsStats(null);
      setSafesWithoutProposals([]);
    }
  }, [userAddress]);

  // If wallet is not connected
  if (!network || !userAddress) {
    return (
      <div className="min-h-screen bg-gray-50 py-8">
        <div className="max-w-4xl mx-auto px-4">
          <div className="text-center py-12">
            <div className="mb-4">
              <span className="text-6xl">⛓</span>
            </div>
            <h3 className="text-xl font-semibold text-gray-700 mb-2">
              Connect Wallet
            </h3>
            <p className="text-gray-500 mb-6">
              To work with proposals, you need to connect a wallet
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-4xl mx-auto px-4">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            Proposals Management
          </h1>
          <p className="text-gray-600">View, sign and execute your proposals</p>
        </div>

        <div className="space-y-6">
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-semibold text-gray-900">
                Proposals Statistics
              </h2>
              <button
                onClick={() =>
                  userAddress && loadUserProposalsStats(userAddress)
                }
                disabled={statsLoading}
                className="px-4 py-2 bg-blue-100 text-blue-700 rounded-lg hover:bg-blue-200 disabled:opacity-50 text-sm"
              >
                {statsLoading ? "Loading..." : "Update"}
              </button>
            </div>

            {/* Proposals statistics */}
            {userProposalsStats && (
              <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                <h3 className="font-semibold text-blue-900 mb-3">Statistics</h3>
                {userProposalsStats.total > 0 ? (
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                    <div className="text-center">
                      <div className="font-bold text-2xl text-gray-800">
                        {userProposalsStats.total}
                      </div>
                      <div className="text-gray-600">Total Proposals</div>
                    </div>
                    <div className="text-center">
                      <div
                        className={`font-bold text-2xl ${
                          userProposalsStats.byStatus.needsMySignature > 0
                            ? "text-orange-600"
                            : "text-gray-400"
                        }`}
                      >
                        {userProposalsStats.byStatus.needsMySignature}
                      </div>
                      <div className="text-gray-600">
                        Require Your Signature
                      </div>
                    </div>
                    <div className="text-center">
                      <div
                        className={`font-bold text-2xl ${
                          userProposalsStats.byStatus.readyToExecute > 0
                            ? "text-green-600"
                            : "text-gray-400"
                        }`}
                      >
                        {userProposalsStats.byStatus.readyToExecute}
                      </div>
                      <div className="text-gray-600">Ready to Execute</div>
                    </div>
                    <div className="text-center">
                      <div className="font-bold text-2xl text-gray-500">
                        {userProposalsStats.byStatus.executed}
                      </div>
                      <div className="text-gray-600">Executed</div>
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-4">
                    <div className="text-gray-500">
                      ✨ You don't have any proposals yet
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Proposals filters */}
            <div className="mb-6">
              <h3 className="text-sm font-medium text-gray-700 mb-3">
                Filter proposals:
              </h3>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => setProposalsFilter("all")}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                    proposalsFilter === "all"
                      ? "bg-blue-600 text-white"
                      : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                  }`}
                >
                  All ({userProposalsStats?.total || 0})
                </button>
                <button
                  onClick={() => setProposalsFilter("needsSignature")}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                    proposalsFilter === "needsSignature"
                      ? "bg-orange-600 text-white"
                      : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                  }`}
                >
                  Require Signature (
                  {userProposalsStats?.byStatus.needsMySignature || 0})
                </button>
                <button
                  onClick={() => setProposalsFilter("readyToExecute")}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                    proposalsFilter === "readyToExecute"
                      ? "bg-green-600 text-white"
                      : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                  }`}
                >
                  Ready to Execute (
                  {userProposalsStats?.byStatus.readyToExecute || 0})
                </button>
                <button
                  onClick={() => setProposalsFilter("executed")}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                    proposalsFilter === "executed"
                      ? "bg-gray-600 text-white"
                      : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                  }`}
                >
                  Executed ({userProposalsStats?.byStatus.executed || 0})
                </button>
              </div>
            </div>
          </div>

          {/* Safe contracts without proposals section */}
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-semibold text-gray-900">
                My Safe Contracts
              </h2>
              <button
                onClick={() =>
                  userAddress && loadSafesWithoutProposals(userAddress)
                }
                disabled={safesLoading}
                className="px-4 py-2 bg-green-100 text-green-700 rounded-lg hover:bg-green-200 disabled:opacity-50 text-sm"
              >
                {safesLoading ? "Loading..." : "Update"}
              </button>
            </div>

            {safesLoading ? (
              <div className="text-center py-8">
                <div className="text-gray-500">
                  ⏳ Loading your Safe contracts...
                </div>
              </div>
            ) : safesWithoutProposals.length > 0 ? (
              <div className="space-y-3">
                <p className="text-sm text-gray-600 mb-4">
                  Click on the Safe contract address to create a proposal for it
                </p>
                {safesWithoutProposals.map((safeAddress) => (
                  <div
                    key={safeAddress}
                    onClick={() => handleSafeClick(safeAddress)}
                    className="p-4 border border-gray-200 rounded-lg hover:border-blue-300 hover:bg-blue-50 cursor-pointer transition-colors"
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="font-mono text-sm text-gray-800">
                          {safeAddress}
                        </div>
                        <div className="text-xs text-gray-500 mt-1">
                          Safe Contract
                        </div>
                      </div>
                      <div className="text-blue-600 text-sm">
                        Create Proposal
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8">
                <div className="text-gray-500">
                  ✨ You don't have any Safe contracts without active proposals
                  yet
                </div>
                <div className="text-sm text-gray-400 mt-2">
                  Create a Safe contract or wait for all proposals to be
                  executed
                </div>
              </div>
            )}
          </div>

          {/* Proposals list */}
          <div>
            <UserProposals
              userAddress={userAddress}
              onProposalAction={handleUserProposalAction}
              refreshTrigger={userProposalsRefresh}
              onSingleProposalUpdate={handleSingleProposalUpdate}
              className=""
            />
          </div>
        </div>
      </div>
    </div>
  );
};

export default ProposalsPage;
