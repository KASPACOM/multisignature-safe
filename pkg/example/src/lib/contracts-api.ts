import axios from "axios";
import { ContractABI } from "./contract-types";
import { ABIParser } from "./abi-parser";
import { getNetworkConfig } from "./constants";

// Types for Safe Transaction Service API response
export interface ContractAPIResponse {
  count: number;
  next: string | null;
  previous: string | null;
  results: ContractAPIResult[];
}

export interface ContractAPIResult {
  address: string;
  name: string;
  displayName: string;
  logoUri: string | null;
  contractAbi: {
    abi: any[];
    description: string;
    relevance: number;
  };
  trustedForDelegateCall: boolean;
}

/**
 * API client for getting list of contracts from Safe Transaction Service
 */
export class ContractsAPI {
  private baseUrl: string;

  constructor(chainId: bigint) {
    const config = getNetworkConfig(Number(chainId));
    this.baseUrl = config.stsUrl;
  }

  /**
   * Gets list of contract ABIs from Safe Transaction Service
   */
  async getContracts(options?: {
    limit?: number;
    offset?: number;
    trusted?: boolean;
  }): Promise<ContractABI[]> {
    try {
      console.log("Loading contracts from Safe Transaction Service...");
      console.log("URL:", this.baseUrl);

      const params = new URLSearchParams();
      if (options?.limit) params.append("limit", options.limit.toString());
      if (options?.offset) params.append("offset", options.offset.toString());
      if (options?.trusted !== undefined)
        params.append("trusted", options.trusted.toString());

      const url = `${this.baseUrl}/api/v1/contracts/`;
      console.log(
        "Full URL request:",
        url + (params.toString() ? `?${params.toString()}` : "")
      );

      const response = await axios.get<ContractAPIResponse>(url, {
        params: Object.fromEntries(params),
        timeout: 10000, // 10 seconds timeout
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
      });

      console.log("Received response from API:", {
        count: response.data.count,
        resultsLength: response.data.results.length,
        hasNext: !!response.data.next,
        hasPrevious: !!response.data.previous,
      });

      // Convert API response to our ContractABI format
      const contracts: ContractABI[] = response.data.results.map((result) => {
        console.log(`Parsing contract: ${result.name} (${result.address})`);

        const parsedFunctions = ABIParser.parseFunctions(
          result.contractAbi.abi
        );
        console.log(
          `Found functions for Safe proposals: ${parsedFunctions.length}`
        );

        return {
          name: result.displayName || result.name,
          address: result.address,
          abi: result.contractAbi.abi,
          parsedFunctions,
        };
      });

      console.log(`Successfully loaded contracts: ${contracts.length}`);
      return contracts;
    } catch (error: any) {
      console.error("Error loading contracts from API:", error);

      if (error.response) {
        console.error("API error details:", {
          status: error.response.status,
          statusText: error.response.statusText,
          data: error.response.data,
        });
        throw new Error(
          `API error: ${error.response.status} - ${error.response.statusText}`
        );
      } else if (error.request) {
        console.error("Network error:", error.message);
        throw new Error(`Network error: ${error.message}`);
      } else {
        console.error("General error:", error.message);
        throw new Error(`Error: ${error.message}`);
      }
    }
  }

  /**
   * Get information about a specific contract
   */
  async getContract(address: string): Promise<ContractABI | null> {
    try {
      console.log(`Loading contract: ${address}`);

      const url = `${this.baseUrl}/api/v1/contracts/${address}/`;
      console.log("URL request:", url);

      const response = await axios.get<ContractAPIResult>(url, {
        timeout: 5000,
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
      });

      const result = response.data;
      const parsedFunctions = ABIParser.parseFunctions(result.contractAbi.abi);

      console.log(
        `Contract loaded: ${result.name}, functions: ${parsedFunctions.length}`
      );

      return {
        name: result.displayName || result.name,
        address: result.address,
        abi: result.contractAbi.abi,
        parsedFunctions,
      };
    } catch (error: any) {
      if (error.response?.status === 404) {
        console.log(`Contract not found in API: ${address}`);
        return null;
      }

      console.error(`Error loading contract ${address}:`, error);
      throw error;
    }
  }
}
