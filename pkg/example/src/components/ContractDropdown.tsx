/**
 * Dropdown for selecting contract from available ABIs
 */

import React, { useState, useEffect } from "react";
import { ContractABI } from "../lib/contract-types";
import { contractRegistry } from "../lib/contract-registry";

interface ContractDropdownProps {
  onContractSelect: (contract: ContractABI | null) => void;
  selectedContract: ContractABI | null;
  placeholder?: string;
  isLoading?: boolean;
  error?: string | null;
}

export const ContractDropdown: React.FC<ContractDropdownProps> = ({
  onContractSelect,
  selectedContract,
  placeholder = "Select contract...",
  isLoading = false,
  error = null,
}) => {
  const [contracts, setContracts] = useState<ContractABI[]>([]);
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    // Load all available contracts
    const loadContracts = () => {
      const allContracts = contractRegistry.getAllContracts();
      setContracts(allContracts);
      console.log("Contracts loaded for dropdown:", allContracts.length);
    };

    // Load immediately
    loadContracts();

    // Update contracts every 2 seconds if they are still loading
    const interval = setInterval(() => {
      const status = contractRegistry.getLoadingStatus();
      if (!status.isLoading && status.hasContracts) {
        loadContracts();
        clearInterval(interval);
      }
    }, 2000);

    return () => clearInterval(interval);
  }, [isLoading]);

  const handleContractSelect = (contract: ContractABI) => {
    onContractSelect(contract);
    setIsOpen(false);
    console.log("Contract selected:", contract.name);
  };

  const clearSelection = () => {
    onContractSelect(null);
    setIsOpen(false);
  };

  return (
    <div className="relative">
      <label className="block text-sm font-medium text-gray-700 mb-2">
        📄 Select Contract
      </label>

      <div className="relative">
        <button
          type="button"
          onClick={() => !isLoading && setIsOpen(!isOpen)}
          disabled={isLoading}
          className={`relative w-full bg-white border border-gray-300 rounded-lg shadow-sm pl-3 pr-10 py-3 text-left focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-purple-500 sm:text-sm ${
            isLoading ? "cursor-not-allowed opacity-50" : "cursor-pointer"
          }`}
        >
          <span className="block truncate">
            {isLoading ? (
              <span className="text-gray-500">Loading contracts...</span>
            ) : error ? (
              <span className="text-red-500">Loading error</span>
            ) : selectedContract ? (
              <span className="font-medium">{selectedContract.name}</span>
            ) : (
              <span className="text-gray-500">{placeholder}</span>
            )}
          </span>
          <span className="absolute inset-y-0 right-0 flex items-center pr-2 pointer-events-none">
            <svg
              className="h-5 w-5 text-gray-400"
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 20 20"
              fill="currentColor"
            >
              <path
                fillRule="evenodd"
                d="M10 3a1 1 0 01.707.293l3 3a1 1 0 01-1.414 1.414L10 5.414 7.707 7.707a1 1 0 01-1.414-1.414l3-3A1 1 0 0110 3zm-3.707 9.293a1 1 0 011.414 0L10 14.586l2.293-2.293a1 1 0 011.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z"
                clipRule="evenodd"
              />
            </svg>
          </span>
        </button>

        {isOpen && !isLoading && !error && (
          <div className="absolute z-10 mt-1 w-full bg-white shadow-lg max-h-60 rounded-md py-1 text-base ring-1 ring-black ring-opacity-5 overflow-auto focus:outline-none sm:text-sm">
            {selectedContract && (
              <div
                onClick={clearSelection}
                className="cursor-pointer select-none relative py-2 pl-3 pr-9 text-gray-500 hover:bg-gray-50 border-b border-gray-100"
              >
                <span className="block truncate text-sm">Clear selection</span>
              </div>
            )}

            {contracts.length === 0 ? (
              <div className="cursor-default select-none relative py-2 pl-3 pr-9 text-gray-500">
                <span className="block truncate text-sm">
                  No available contracts
                </span>
              </div>
            ) : (
              contracts.map((contract) => (
                <div
                  key={contract.address}
                  onClick={() => handleContractSelect(contract)}
                  className={`cursor-pointer select-none relative py-2 pl-3 pr-9 hover:bg-purple-50 ${
                    selectedContract?.address === contract.address
                      ? "bg-purple-100"
                      : ""
                  }`}
                >
                  <div className="flex items-center">
                    <span className="font-medium text-gray-900 block truncate">
                      {contract.name}
                    </span>
                  </div>
                  <p className="text-xs text-gray-400 font-mono mt-1">
                    {contract.address}
                  </p>

                  {selectedContract?.address === contract.address && (
                    <span className="absolute inset-y-0 right-0 flex items-center pr-4 text-purple-600">
                      <svg
                        className="h-5 w-5"
                        xmlns="http://www.w3.org/2000/svg"
                        viewBox="0 0 20 20"
                        fill="currentColor"
                      >
                        <path
                          fillRule="evenodd"
                          d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                          clipRule="evenodd"
                        />
                      </svg>
                    </span>
                  )}
                </div>
              ))
            )}
          </div>
        )}
      </div>

      {selectedContract && (
        <div className="mt-2 text-xs text-gray-600">
          <span>Available functions: </span>
          <span className="font-medium">
            {
              contractRegistry.getContractFunctions(selectedContract.address)
                .length
            }
          </span>
        </div>
      )}
    </div>
  );
};
