/**
 * Component for selecting contract from predefined list or entering custom address
 */

import React, { useState, useEffect } from "react";
import { ContractABI } from "../lib/contract-types";
import { contractRegistry } from "../lib/contract-registry";
import { ContractInfo } from "./TokenInfo";
import SafeOnChain from "../lib/onchain";

interface ContractSelectorProps {
  onContractSelect: (contract: ContractABI | null) => void;
  selectedContract: ContractABI | null;
  safeOnChain?: SafeOnChain | null;
}

export const ContractSelector: React.FC<ContractSelectorProps> = ({
  onContractSelect,
  selectedContract,
  safeOnChain,
}) => {
  const [contracts, setContracts] = useState<ContractABI[]>([]);
  const [customAddress, setCustomAddress] = useState("");
  const [mode, setMode] = useState<"predefined" | "custom">("predefined");
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    // Load all contracts from registry
    const allContracts = contractRegistry.getAllContracts();
    setContracts(allContracts);

    console.log("Contracts loaded:", allContracts.length);
  }, []);

  // Filter contracts by search query
  const filteredContracts = contracts.filter(
    (contract) =>
      contract.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      contract.address.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handlePredefinedSelect = (contract: ContractABI) => {
    console.log("Predefined contract selected:", contract.name);
    onContractSelect(contract);
  };

  const handleCustomAddressChange = (address: string) => {
    setCustomAddress(address);

    if (address && /^0x[a-fA-F0-9]{40}$/.test(address)) {
      // Check if contract exists in registry
      const existingContract = contractRegistry.getContract(address);
      if (existingContract) {
        console.log("Existing contract found:", existingContract.name);
        onContractSelect(existingContract);
      } else {
        console.log("Contract not found in registry, creating temporary");
        // Create temporary contract for custom address
        const customContract: ContractABI = {
          name: `Custom Contract (${address.slice(0, 6)}...)`,
          address,
          abi: [],
          parsedFunctions: [],
        };
        onContractSelect(customContract);
      }
    } else {
      onContractSelect(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center space-x-4 mb-4">
        <h3 className="text-lg font-semibold text-gray-900">
          📄 Contract Selection
        </h3>
        <div className="flex space-x-2">
          <button
            onClick={() => setMode("predefined")}
            className={`px-3 py-1 rounded-md text-sm font-medium transition-colors ${
              mode === "predefined"
                ? "bg-purple-100 text-purple-700"
                : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
          >
            Predefined
          </button>
          <button
            onClick={() => setMode("custom")}
            className={`px-3 py-1 rounded-md text-sm font-medium transition-colors ${
              mode === "custom"
                ? "bg-purple-100 text-purple-700"
                : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
          >
            Custom Address
          </button>
        </div>
      </div>

      {mode === "predefined" && (
        <div className="space-y-4">
          {/* Search */}
          <div>
            <input
              type="text"
              placeholder="Search by name, category or description..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
            />
          </div>

          {/* Contract list */}
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {filteredContracts.map((contract) => (
              <div
                key={contract.address}
                onClick={() => handlePredefinedSelect(contract)}
                className={`p-3 border rounded-lg cursor-pointer transition-all hover:shadow-md ${
                  selectedContract?.address === contract.address
                    ? "border-purple-500 bg-purple-50"
                    : "border-gray-200 hover:border-gray-300"
                }`}
              >
                <div className="flex justify-between items-start">
                  <div className="flex-1">
                    <h5 className="font-medium text-gray-900">
                      {contract.name}
                    </h5>
                    <p className="text-xs text-gray-500 mt-2 font-mono">
                      {contract.address}
                    </p>
                  </div>
                  {selectedContract?.address === contract.address && (
                    <div className="text-purple-500">
                      <svg
                        className="w-5 h-5"
                        fill="currentColor"
                        viewBox="0 0 20 20"
                      >
                        <path
                          fillRule="evenodd"
                          d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                          clipRule="evenodd"
                        />
                      </svg>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>

          {filteredContracts.length === 0 && searchQuery && (
            <div className="text-center py-8 text-gray-500">
              <p>No contracts found for query "{searchQuery}"</p>
            </div>
          )}
        </div>
      )}

      {mode === "custom" && (
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Contract Address
            </label>
            <input
              type="text"
              placeholder="0x1234567890123456789012345678901234567890"
              value={customAddress}
              onChange={(e) => handleCustomAddressChange(e.target.value)}
              className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 font-mono"
            />
            {customAddress && !/^0x[a-fA-F0-9]{40}$/.test(customAddress) && (
              <p className="text-sm text-red-600 mt-1">
                Invalid Ethereum address format
              </p>
            )}
          </div>

          {selectedContract && mode === "custom" && (
            <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
              <div className="flex">
                <div className="flex-shrink-0">
                  <svg
                    className="h-5 w-5 text-yellow-400"
                    viewBox="0 0 20 20"
                    fill="currentColor"
                  >
                    <path
                      fillRule="evenodd"
                      d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
                      clipRule="evenodd"
                    />
                  </svg>
                </div>
                <div className="ml-3">
                  <h3 className="text-sm font-medium text-yellow-800">
                    Custom Contract
                  </h3>
                  <p className="mt-1 text-sm text-yellow-700">
                    ABI for this contract is not loaded. You can only use manual
                    function input.
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Selected contract information */}
      {selectedContract && (
        <div className="mt-4 space-y-4">
          <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
            <div className="flex">
              <div className="flex-shrink-0">
                <svg
                  className="h-5 w-5 text-green-400"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                >
                  <path
                    fillRule="evenodd"
                    d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                    clipRule="evenodd"
                  />
                </svg>
              </div>
              <div className="ml-3">
                <h3 className="text-sm font-medium text-green-800">
                  Contract selected: {selectedContract.name}
                </h3>
                <p className="mt-1 text-sm text-green-700">
                  Address: {selectedContract.address}
                </p>
                {contractRegistry.hasContract(selectedContract.address) && (
                  <p className="mt-1 text-sm text-green-700">
                    Available functions:{" "}
                    {
                      contractRegistry.getContractFunctions(
                        selectedContract.address
                      ).length
                    }
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* TypeChain contract information */}
          {safeOnChain && (
            <ContractInfo
              contractAddress={selectedContract.address}
              safeOnChain={safeOnChain}
            />
          )}
        </div>
      )}
    </div>
  );
};
