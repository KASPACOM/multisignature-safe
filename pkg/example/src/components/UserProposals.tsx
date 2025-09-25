import React, { useState, useEffect } from "react";
import SafeOffChain, {
  UserProposal,
  UserProposalsFilter,
} from "../lib/offchain";
import { formatAddress, formatEthValue } from "../lib/safe-common";

export enum ProposalAction {
  SIGN = "sign",
  EXECUTE = "execute",
  VIEW = "view",
}

interface UserProposalsProps {
  userAddress: string;
  className?: string;
  onProposalAction?: (proposal: UserProposal, action: ProposalAction) => void;
  refreshTrigger?: number; // For forced refresh from outside
  onSingleProposalUpdate?: (safeTxHash: string) => void; // Function for targeted proposal update
}

interface ProposalStats {
  total: number;
  pending: number;
  executable: number;
  executed: number;
  byStatus: {
    needsMySignature: number;
    waitingForOthers: number;
    readyToExecute: number;
    executed: number;
  };
}

type ProposalFilter =
  | "all"
  | "needsMySignature"
  | "waitingForOthers"
  | "readyToExecute"
  | "executed";

const UserProposals: React.FC<UserProposalsProps> = ({
  userAddress,
  className = "",
  onProposalAction,
  refreshTrigger,
  onSingleProposalUpdate,
}) => {
  const [safeOffChain] = useState(() => new SafeOffChain());
  const [proposals, setProposals] = useState<UserProposal[]>([]);
  const [stats, setStats] = useState<ProposalStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>("");
  const [filter, setFilter] = useState<ProposalFilter>("all");
  const [expandedProposal, setExpandedProposal] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<{
    [txHash: string]: "signing" | "executing";
  }>({}); // For tracking actions on specific proposals
  const [updatingProposals, setUpdatingProposals] = useState<Set<string>>(
    new Set()
  ); // For tracking proposals being updated

  // Load user proposals
  const loadUserProposals = async () => {
    if (!userAddress) return;

    setLoading(true);
    setError("");

    try {
      console.log("📥 Loading user proposals:", userAddress);

      // Get proposals statistics
      const statsData = await safeOffChain.getUserProposalsStats(userAddress);
      setStats(statsData);

      // Get all user proposals
      const userProposalsFilter: UserProposalsFilter = {
        userAddress,
        sortBy: "submissionDate",
        sortOrder: "desc",
        limit: 50,
      };

      const userProposals = await safeOffChain.getUserProposals(
        userProposalsFilter
      );
      setProposals(userProposals);

      console.log("Proposals loaded:", {
        stats: statsData,
        proposals: userProposals.length,
      });
    } catch (err) {
      console.error("Proposals loading error:", err);
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  };

  // Update only one proposal
  const updateSingleProposal = async (
    safeTxHash: string,
    maxRetries = 3,
    delay = 1500
  ) => {
    console.log("Updating single proposal:", safeTxHash);

    // Add proposal to updating list
    setUpdatingProposals((prev) => new Set([...prev, safeTxHash]));

    let attempts = 0;

    const tryUpdate = async () => {
      attempts++;
      console.log(
        `Proposal update attempt ${safeTxHash}: ${attempts}/${maxRetries}`
      );

      try {
        // Get updated data for specific proposal
        const updatedTransaction = await safeOffChain.getTransaction(
          safeTxHash
        );
        console.log("📥 Received updated proposal data:", {
          safeTxHash,
          isExecuted: updatedTransaction.isExecuted,
          isSuccessful: updatedTransaction.isSuccessful,
          executionDate: updatedTransaction.executionDate,
          confirmations: updatedTransaction.confirmations?.length || 0,
        });

        // Update only this proposal in the list
        setProposals((prevProposals) =>
          prevProposals.map((proposal) => {
            if (proposal.safeTxHash === safeTxHash) {
              return {
                ...proposal,
                confirmations: updatedTransaction.confirmations || [],
                confirmationsRequired:
                  updatedTransaction.confirmationsRequired ||
                  proposal.confirmationsRequired,
                isExecuted: updatedTransaction.isExecuted,
                executionDate: updatedTransaction.executionDate,
                isSuccessful: updatedTransaction.isSuccessful,
                transactionHash: updatedTransaction.transactionHash,
              };
            }
            return proposal;
          })
        );

        console.log("Proposal updated:", safeTxHash);

        // Also update statistics (lighter than entire list)
        if (userAddress) {
          try {
            const updatedStats = await safeOffChain.getUserProposalsStats(
              userAddress
            );
            setStats(updatedStats);
          } catch (statsError) {
            console.warn("Failed to update statistics:", statsError);
          }
        }

        // Remove proposal from updating list
        setUpdatingProposals((prev) => {
          const newSet = new Set(prev);
          newSet.delete(safeTxHash);
          return newSet;
        });

        return true; // Successfully updated
      } catch (error: any) {
        console.warn(
          `Failed to update proposal ${safeTxHash} (attempt ${attempts}):`,
          error
        );

        // If not last attempt, schedule next one
        if (attempts < maxRetries) {
          setTimeout(tryUpdate, delay);
          return false;
        } else {
          // Remove from updating list after all failed attempts
          setUpdatingProposals((prev) => {
            const newSet = new Set(prev);
            newSet.delete(safeTxHash);
            return newSet;
          });
          console.error(
            `Failed to update proposal ${safeTxHash} after ${maxRetries} attempts`
          );
          return false;
        }
      }
    };

    // First attempt immediately
    await tryUpdate();
  };

  // Effect for initial loading and updating on user change
  useEffect(() => {
    loadUserProposals();
  }, [userAddress, refreshTrigger]);

  // Filter proposals by status
  const getFilteredProposals = (): UserProposal[] => {
    if (!stats) return proposals;

    switch (filter) {
      case "needsMySignature":
        return proposals.filter((p) => {
          if (p.isExecuted) return false;
          const userHasSigned = p.confirmations?.some(
            (conf) => conf.owner.toLowerCase() === userAddress.toLowerCase()
          );
          return !userHasSigned;
        });

      case "waitingForOthers":
        return proposals.filter((p) => {
          if (p.isExecuted) return false;
          const userHasSigned = p.confirmations?.some(
            (conf) => conf.owner.toLowerCase() === userAddress.toLowerCase()
          );
          const hasEnoughSignatures =
            (p.confirmations?.length || 0) >= p.confirmationsRequired;
          return userHasSigned && !hasEnoughSignatures;
        });

      case "readyToExecute":
        return proposals.filter((p) => {
          if (p.isExecuted) return false;
          return (p.confirmations?.length || 0) >= p.confirmationsRequired;
        });

      case "executed":
        return proposals.filter((p) => p.isExecuted);

      case "all":
      default:
        return proposals;
    }
  };

  // Get proposal status icon
  const getProposalStatusIcon = (
    proposal: UserProposal
  ): { icon: string; color: string; text: string } => {
    if (proposal.isExecuted) {
      return {
        icon: "Done",
        color: "text-green-600",
        text: "Executed",
      };
    }

    const userHasSigned =
      proposal.confirmations?.some(
        (conf) => conf.owner.toLowerCase() === userAddress.toLowerCase()
      ) || false;
    const hasEnoughSignatures =
      (proposal.confirmations?.length || 0) >= proposal.confirmationsRequired;

    if (!userHasSigned) {
      return {
        icon: "Sign",
        color: "text-orange-600",
        text: "Requires your signature",
      };
    }

    if (hasEnoughSignatures) {
      return {
        icon: "Exec",
        color: "text-blue-600",
        text: "Ready to execute",
      };
    }

    return {
      icon: "⏳",
      color: "text-yellow-600",
      text: "Waiting for other signatures",
    };
  };

  // Handle proposal actions
  const handleProposalAction = async (
    proposal: UserProposal,
    action: ProposalAction
  ) => {
    console.log(`🎬 Proposal action: ${action}`, proposal.safeTxHash);

    // Set loading state for this proposal
    if (action === ProposalAction.SIGN) {
      setActionLoading((prev) => ({
        ...prev,
        [proposal.safeTxHash]: "signing",
      }));
    } else if (action === ProposalAction.EXECUTE) {
      setActionLoading((prev) => ({
        ...prev,
        [proposal.safeTxHash]: "executing",
      }));
    }

    try {
      // Call parent handler
      await onProposalAction?.(proposal, action);

      // After successful action, run targeted proposal update
      if (action === ProposalAction.SIGN || action === ProposalAction.EXECUTE) {
        // Always update specific proposal
        setTimeout(
          () => {
            updateSingleProposal(
              proposal.safeTxHash,
              action === ProposalAction.EXECUTE ? 5 : 3, // More attempts for execute
              action === ProposalAction.EXECUTE ? 3000 : 1500 // Larger interval for execute
            );
          },
          action === ProposalAction.EXECUTE ? 2000 : 500
        );

        // Additionally call statistics update (if provided)
        if (onSingleProposalUpdate) {
          setTimeout(
            () => {
              onSingleProposalUpdate(proposal.safeTxHash);
            },
            action === ProposalAction.EXECUTE ? 1500 : 1000
          ); // With slight delay after proposal update
        }
      }
    } finally {
      // Clear loading state after small delay
      setTimeout(
        () => {
          setActionLoading((prev) => {
            const newState = { ...prev };
            delete newState[proposal.safeTxHash];
            return newState;
          });
        },
        action === ProposalAction.EXECUTE ? 8000 : 4000
      ); // More time for execute
    }
  };

  // Toggle expanded proposal display
  const toggleExpandedProposal = (safeTxHash: string) => {
    setExpandedProposal(expandedProposal === safeTxHash ? null : safeTxHash);
  };

  const filteredProposals = getFilteredProposals();

  return (
    <div className={`bg-white rounded-lg shadow ${className}`}>
      {/* Header */}
      <div className="border-b border-gray-200 px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-semibold text-gray-900">
              My Proposals
            </h2>
            <p className="text-sm text-gray-600 mt-1">
              Transactions assigned to {formatAddress(userAddress)}
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={loadUserProposals}
              disabled={loading}
              className="px-3 py-2 bg-blue-100 text-blue-700 rounded-lg hover:bg-blue-200 disabled:opacity-50 transition-colors text-sm"
            >
              {loading ? "Refresh" : "Refresh"} Refresh
            </button>

            {!safeOffChain.isSTSAvailable() && (
              <div className="px-2 py-1 bg-yellow-100 text-yellow-800 text-xs rounded">
                Local Mode
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Statistics */}
      {stats && (
        <div className="px-6 py-4 bg-gray-50">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="text-center">
              <div className="text-2xl font-bold text-gray-900">
                {stats.total}
              </div>
              <div className="text-sm text-gray-600">Total</div>
            </div>

            <div className="text-center">
              <div className="text-2xl font-bold text-orange-600">
                {stats.byStatus.needsMySignature}
              </div>
              <div className="text-sm text-gray-600">Require Signature</div>
            </div>

            <div className="text-2xl font-bold text-blue-600 text-center">
              <div>{stats.byStatus.readyToExecute}</div>
              <div className="text-sm text-gray-600">Ready to Execute</div>
            </div>

            <div className="text-center">
              <div className="text-2xl font-bold text-green-600">
                {stats.byStatus.executed}
              </div>
              <div className="text-sm text-gray-600">Executed</div>
            </div>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="px-6 py-3 border-b border-gray-100">
        <div className="flex flex-wrap gap-2">
          {[
            { key: "all", label: "All", count: stats?.total || 0 },
            {
              key: "needsMySignature",
              label: "Require Signature",
              count: stats?.byStatus.needsMySignature || 0,
            },
            {
              key: "waitingForOthers",
              label: "⏳ Waiting for Others",
              count: stats?.byStatus.waitingForOthers || 0,
            },
            {
              key: "readyToExecute",
              label: "Ready to Execute",
              count: stats?.byStatus.readyToExecute || 0,
            },
            {
              key: "executed",
              label: "Executed",
              count: stats?.byStatus.executed || 0,
            },
          ].map((filterOption) => (
            <button
              key={filterOption.key}
              onClick={() => setFilter(filterOption.key as ProposalFilter)}
              className={`px-3 py-1 rounded-full text-sm font-medium transition-colors ${
                filter === filterOption.key
                  ? "bg-blue-100 text-blue-700"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              }`}
            >
              {filterOption.label}
              {filterOption.count > 0 && (
                <span className="ml-1 px-1.5 py-0.5 bg-white rounded-full text-xs">
                  {filterOption.count}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Error messages */}
      {error && (
        <div className="mx-6 mt-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg">
          <div className="flex items-center gap-2">
            <span>Error</span>
            <span>{error}</span>
          </div>
        </div>
      )}

      {/* Loading state */}
      {loading && (
        <div className="flex items-center justify-center py-8">
          <div className="flex items-center gap-3 text-gray-600">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
            <span>Loading proposals...</span>
          </div>
        </div>
      )}

      {/* Proposals list */}
      {!loading && (
        <div className="px-6 py-4">
          {filteredProposals.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              {filter === "all" ? (
                <div>
                  <div className="text-4xl mb-3">📭</div>
                  <div className="text-lg font-medium mb-2">No Proposals</div>
                  <div className="text-sm">
                    {safeOffChain.isSTSAvailable()
                      ? "STS contains no proposals for this user"
                      : "No saved proposals in local storage"}
                  </div>
                </div>
              ) : (
                <div>
                  <div className="text-2xl mb-2">-</div>
                  <div>No proposals with this status</div>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              {filteredProposals.map((proposal) => {
                const status = getProposalStatusIcon(proposal);
                const isExpanded = expandedProposal === proposal.safeTxHash;
                const isUpdating = updatingProposals.has(proposal.safeTxHash);

                return (
                  <div
                    key={proposal.safeTxHash}
                    className={`border rounded-lg overflow-hidden transition-all duration-300 ${
                      isUpdating
                        ? "border-blue-300 bg-blue-50 shadow-md"
                        : "border-gray-200"
                    }`}
                  >
                    {/* Main information */}
                    <div className="p-4">
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-3">
                          <span className={`text-lg ${status.color}`}>
                            {status.icon}
                          </span>
                          {isUpdating && (
                            <span className="text-sm text-blue-600 animate-pulse">
                              Updating...
                            </span>
                          )}
                          <div>
                            <div className="font-medium text-gray-900">
                              {formatAddress(proposal.to)}
                              {proposal.value !== "0" && (
                                <span className="ml-2 text-sm text-green-600">
                                  {formatEthValue(proposal.value)} ETH
                                </span>
                              )}
                            </div>
                            <div className={`text-sm ${status.color}`}>
                              {status.text}
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <span className="text-xs text-gray-500">
                            Nonce: {proposal.nonce}
                          </span>

                          <button
                            onClick={() =>
                              toggleExpandedProposal(proposal.safeTxHash)
                            }
                            className="p-1 rounded hover:bg-gray-100"
                          >
                            <span
                              className={`transform transition-transform ${
                                isExpanded ? "rotate-180" : ""
                              }`}
                            >
                              ▼
                            </span>
                          </button>
                        </div>
                      </div>

                      {/* Brief signature information */}
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4 text-sm text-gray-600">
                          <div>
                            <span className="font-medium">Signatures:</span>
                            <span
                              className={`ml-1 ${
                                (proposal.confirmations?.length || 0) >=
                                proposal.confirmationsRequired
                                  ? "text-green-600"
                                  : "text-orange-600"
                              }`}
                            >
                              {proposal.confirmations?.length || 0} /{" "}
                              {proposal.confirmationsRequired}
                            </span>
                          </div>

                          <div>
                            <span className="font-medium">Safe:</span>
                            <span className="ml-1">
                              {formatAddress(proposal.safe)}
                            </span>
                          </div>

                          <div>
                            <span className="font-medium">Date:</span>
                            <span className="ml-1">
                              {new Date(
                                proposal.submissionDate
                              ).toLocaleDateString("en-US")}
                            </span>
                          </div>
                        </div>

                        {/* Action buttons */}
                        <div className="flex gap-2">
                          {!proposal.isExecuted && (
                            <>
                              {!proposal.confirmations?.some(
                                (conf) =>
                                  conf.owner.toLowerCase() ===
                                  userAddress.toLowerCase()
                              ) &&
                                (proposal.confirmations?.length || 0) <
                                  proposal.confirmationsRequired && (
                                  <button
                                    onClick={() =>
                                      handleProposalAction(
                                        proposal,
                                        ProposalAction.SIGN
                                      )
                                    }
                                    disabled={
                                      actionLoading[proposal.safeTxHash] ===
                                      "signing"
                                    }
                                    className="px-3 py-1 bg-orange-100 text-orange-700 rounded text-sm hover:bg-orange-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                  >
                                    {actionLoading[proposal.safeTxHash] ===
                                    "signing"
                                      ? "Signing..."
                                      : "Sign"}
                                  </button>
                                )}

                              {/* Show status if user already signed */}
                              {proposal.confirmations?.some(
                                (conf) =>
                                  conf.owner.toLowerCase() ===
                                  userAddress.toLowerCase()
                              ) &&
                                (proposal.confirmations?.length || 0) <
                                  proposal.confirmationsRequired && (
                                  <span className="px-3 py-1 bg-green-100 text-green-700 rounded text-sm">
                                    You Signed
                                  </span>
                                )}

                              {/* Show status if threshold reached but user didn't sign */}
                              {!proposal.confirmations?.some(
                                (conf) =>
                                  conf.owner.toLowerCase() ===
                                  userAddress.toLowerCase()
                              ) &&
                                (proposal.confirmations?.length || 0) >=
                                  proposal.confirmationsRequired && (
                                  <span className="px-3 py-1 bg-blue-100 text-blue-700 rounded text-sm">
                                    Signatures Collected
                                  </span>
                                )}

                              {/* Show status if user signed AND threshold reached */}
                              {proposal.confirmations?.some(
                                (conf) =>
                                  conf.owner.toLowerCase() ===
                                  userAddress.toLowerCase()
                              ) &&
                                (proposal.confirmations?.length || 0) >=
                                  proposal.confirmationsRequired && (
                                  <span className="px-3 py-1 bg-green-100 text-green-700 rounded text-sm">
                                    Ready to Execute
                                  </span>
                                )}

                              {(proposal.confirmations?.length || 0) >=
                                proposal.confirmationsRequired && (
                                <button
                                  onClick={() =>
                                    handleProposalAction(
                                      proposal,
                                      ProposalAction.EXECUTE
                                    )
                                  }
                                  disabled={
                                    actionLoading[proposal.safeTxHash] ===
                                    "executing"
                                  }
                                  className="px-3 py-1 bg-blue-100 text-blue-700 rounded text-sm hover:bg-blue-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                  {actionLoading[proposal.safeTxHash] ===
                                  "executing"
                                    ? "Executing..."
                                    : "Execute"}
                                </button>
                              )}
                            </>
                          )}

                          <button
                            onClick={() =>
                              handleProposalAction(
                                proposal,
                                ProposalAction.VIEW
                              )
                            }
                            className="px-3 py-1 bg-gray-100 text-gray-700 rounded text-sm hover:bg-gray-200 transition-colors"
                          >
                            Details
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* Expanded information */}
                    {isExpanded && (
                      <div className="border-t border-gray-100 bg-gray-50 p-4">
                        <div className="space-y-3">
                          <div>
                            <label className="text-sm font-medium text-gray-700">
                              TX Hash:
                            </label>
                            <div className="mt-1 p-2 bg-white border rounded font-mono text-xs break-all">
                              {proposal.safeTxHash}
                            </div>
                          </div>

                          {proposal.data && proposal.data !== "0x" && (
                            <div>
                              <label className="text-sm font-medium text-gray-700">
                                Data:
                              </label>
                              <div className="mt-1 p-2 bg-white border rounded font-mono text-xs break-all">
                                {proposal.data.slice(0, 100)}
                                {proposal.data.length > 100 && "..."}
                              </div>
                            </div>
                          )}

                          {(proposal.confirmations?.length || 0) > 0 && (
                            <div>
                              <label className="text-sm font-medium text-gray-700 mb-2 block">
                                Signatures (
                                {proposal.confirmations?.length || 0}):
                              </label>
                              <div className="space-y-2">
                                {proposal.confirmations?.map((conf, index) => (
                                  <div
                                    key={index}
                                    className="flex items-center gap-3 p-2 bg-white border rounded"
                                  >
                                    <div className="flex-1">
                                      <div className="font-medium text-sm">
                                        {formatAddress(conf.owner)}
                                        {conf.owner.toLowerCase() ===
                                          userAddress.toLowerCase() && (
                                          <span className="ml-2 px-2 py-1 bg-green-100 text-green-800 text-xs rounded">
                                            You
                                          </span>
                                        )}
                                      </div>
                                      <div className="text-xs text-gray-500">
                                        {new Date(
                                          conf.submissionDate
                                        ).toLocaleString("en-US")}
                                      </div>
                                    </div>
                                    <div className="text-xs text-gray-400">
                                      {conf.signatureType || "EOA"}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          {proposal.dataDecoded && (
                            <div>
                              <label className="text-sm font-medium text-gray-700">
                                Decoded Data:
                              </label>
                              <div className="mt-1 p-2 bg-white border rounded text-xs">
                                <pre className="whitespace-pre-wrap">
                                  {JSON.stringify(
                                    proposal.dataDecoded,
                                    null,
                                    2
                                  )}
                                </pre>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default UserProposals;
