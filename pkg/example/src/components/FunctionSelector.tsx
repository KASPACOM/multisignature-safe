/**
 * Component for selecting contract function
 */

import React, { useState, useEffect } from "react";
import { ParsedFunction } from "../lib/contract-types";
import { contractRegistry } from "../lib/contract-registry";

interface FunctionSelectorProps {
  contractAddress: string | null;
  onFunctionSelect: (func: ParsedFunction | null) => void;
  selectedFunction: ParsedFunction | null;
}

export const FunctionSelector: React.FC<FunctionSelectorProps> = ({
  contractAddress,
  onFunctionSelect,
  selectedFunction,
}) => {
  const [functions, setFunctions] = useState<ParsedFunction[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterPayable, setFilterPayable] = useState<
    "all" | "payable" | "nonpayable"
  >("all");

  useEffect(() => {
    if (contractAddress) {
      const contractFunctions =
        contractRegistry.getContractFunctions(contractAddress);
      setFunctions(contractFunctions);
      console.log(
        `Functions loaded for contract ${contractAddress}:`,
        contractFunctions.length
      );
    } else {
      setFunctions([]);
    }

    // Reset selected function when contract changes
    onFunctionSelect(null);
  }, [contractAddress, onFunctionSelect]);

  // Filter functions
  const filteredFunctions = functions.filter((func) => {
    const matchesSearch =
      func.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      func.signature.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesPayable =
      filterPayable === "all" ||
      (filterPayable === "payable" && func.payable) ||
      (filterPayable === "nonpayable" && !func.payable);

    return matchesSearch && matchesPayable;
  });

  const handleFunctionSelect = (func: ParsedFunction) => {
    console.log("Function selected:", func.name);
    onFunctionSelect(func);
  };

  if (!contractAddress) {
    return (
      <div className="p-6 bg-gray-50 border border-gray-200 rounded-lg text-center">
        <div className="text-gray-400">
          <svg
            className="mx-auto h-12 w-12 mb-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
            />
          </svg>
          <p className="text-gray-500">First select a contract</p>
        </div>
      </div>
    );
  }

  if (functions.length === 0) {
    return (
      <div className="p-6 bg-yellow-50 border border-yellow-200 rounded-lg text-center">
        <div className="text-yellow-600">
          <svg
            className="mx-auto h-12 w-12 mb-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z"
            />
          </svg>
          <p className="text-yellow-800 font-medium">ABI not loaded</p>
          <p className="text-yellow-700 text-sm mt-1">
            This contract has no available functions. Use manual input.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-gray-900">
          Function Selection
        </h3>
        <div className="text-sm text-gray-500">
          Found: {filteredFunctions.length} of {functions.length}
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="flex-1">
          <input
            type="text"
            placeholder="Search by name or signature..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
          />
        </div>
        <div className="flex space-x-2">
          <button
            onClick={() => setFilterPayable("all")}
            className={`px-3 py-2 rounded-md text-sm font-medium transition-colors ${
              filterPayable === "all"
                ? "bg-purple-100 text-purple-700"
                : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
          >
            All
          </button>
          <button
            onClick={() => setFilterPayable("payable")}
            className={`px-3 py-2 rounded-md text-sm font-medium transition-colors ${
              filterPayable === "payable"
                ? "bg-green-100 text-green-700"
                : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
          >
            💰 Payable
          </button>
          <button
            onClick={() => setFilterPayable("nonpayable")}
            className={`px-3 py-2 rounded-md text-sm font-medium transition-colors ${
              filterPayable === "nonpayable"
                ? "bg-blue-100 text-blue-700"
                : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
          >
            Regular
          </button>
        </div>
      </div>

      {/* Function list */}
      <div className="space-y-2 max-h-96 overflow-y-auto">
        {filteredFunctions.map((func) => (
          <div
            key={func.signature}
            onClick={() => handleFunctionSelect(func)}
            className={`p-4 border rounded-lg cursor-pointer transition-all hover:shadow-md ${
              selectedFunction?.signature === func.signature
                ? "border-purple-500 bg-purple-50"
                : "border-gray-200 hover:border-gray-300"
            }`}
          >
            <div className="flex justify-between items-start">
              <div className="flex-1">
                <div className="flex items-center space-x-2">
                  <h5 className="font-medium text-gray-900">{func.name}</h5>
                  {func.payable && (
                    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800">
                      💰 payable
                    </span>
                  )}
                  <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-800">
                    {func.stateMutability}
                  </span>
                </div>
                <p className="text-xs text-gray-500 mt-2 font-mono bg-gray-50 p-2 rounded">
                  {func.signature}
                </p>
                {func.inputs.length > 0 && (
                  <div className="mt-3">
                    <p className="text-xs font-medium text-gray-700 mb-1">
                      Parameters:
                    </p>
                    <div className="space-y-1">
                      {func.inputs.map((input, index) => (
                        <div key={index} className="text-xs text-gray-600 flex">
                          <span className="font-mono bg-gray-100 px-1 rounded mr-2 min-w-0">
                            {input.type}
                          </span>
                          <span className="font-medium">
                            {input.name || `param${index}`}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
              {selectedFunction?.signature === func.signature && (
                <div className="text-purple-500 ml-4">
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

      {filteredFunctions.length === 0 && searchQuery && (
        <div className="text-center py-8 text-gray-500">
          <p>No functions found for query "{searchQuery}"</p>
        </div>
      )}

      {/* Selected function information */}
      {selectedFunction && (
        <div className="mt-4 p-4 bg-green-50 border border-green-200 rounded-lg">
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
                Function selected: {selectedFunction.name}
              </h3>
              <p className="mt-1 text-sm text-green-700">
                Parameters: {selectedFunction.inputs.length}
                {selectedFunction.payable && " | Accepts ETH"}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
