import { BrowserProvider, Eip1193Provider, ethers } from 'ethers'
import { 
  Network, 
  WalletState, 
  ConnectionStatus, 
  WalletEvent, 
  NetworkConfig,
  WALLET_TRANSITIONS 
} from './network-types'
import { getNetworkConfig } from './safe-common'

type Eth = Eip1193Provider & {
  on: (e: string, l: (...a: any[]) => void) => void;
  request?: (o: { method: string; params: any[] }) => Promise<any>;
};

declare let window: Window & { ethereum?: Eth };

let wallet: Eth;

export class NetworkProvider {
  private currentStatus: ConnectionStatus = { 
    state: WalletState.NoProvider,
    isLoading: false 
  }
  
  // Коллбеки для уведомления об изменениях состояния
  private statusCallbacks: Set<(status: ConnectionStatus) => void> = new Set()
  
  // Поддерживаемые сети
  private supportedNetworks: Map<bigint, NetworkConfig> = new Map()

  constructor() {
    if (typeof window !== 'undefined' && window.ethereum) {
      this.detectProvider()
    }
    this.initializeSupportedNetworks()
  }

  // Инициализация поддерживаемых сетей
  private initializeSupportedNetworks() {
    // Пока используем одну сеть из safe-common
    const networkConfig = getNetworkConfig()

    this.supportedNetworks.set(
      BigInt(networkConfig.chainId), 
      {
        chainId: BigInt(networkConfig.chainId),
        name: networkConfig.name,
        rpcUrl: networkConfig.rpcUrl,
        contracts: networkConfig.contracts
      }
    )
  }

  // Подписка на изменения состояния
  onStatusChange(callback: (status: ConnectionStatus) => void): () => void {
    this.statusCallbacks.add(callback)
    
    // Сразу вызываем callback с текущим состоянием
    callback(this.currentStatus)
    
    // Возвращаем функцию для отписки
    return () => {
      this.statusCallbacks.delete(callback)
    }
  }

  // Получить текущее состояние
  getCurrentStatus(): ConnectionStatus {
    return { ...this.currentStatus }
  }

  // Получить текущую сеть (если подключена)
  getCurrentNetwork(): Network | null {
    return this.currentStatus.network || null
  }

  // Обработка события и переход состояния
  private processEvent(event: WalletEvent) {
    console.log('🔄 NetworkProvider: Обработка события:', event.type, event)
    console.log('📊 Текущее состояние:', this.currentStatus.state)

    // Ищем подходящий переход
    const transition = WALLET_TRANSITIONS.find(t => 
      t.from === this.currentStatus.state && 
      t.trigger === event.type &&
      (!t.condition || t.condition(this.currentStatus, event))
    )

    if (!transition) {
      console.warn('⚠️ NetworkProvider: Переход не найден для:', {
        from: this.currentStatus.state,
        trigger: event.type
      })
      return
    }

    console.log('🎯 NetworkProvider: Переход:', `${transition.from} → ${transition.to}`)

    // Обновляем состояние на основе события
    this.updateStatus(transition.to, event)
  }

  // Обновление состояния и уведомление подписчиков
  private updateStatus(newState: WalletState, event?: WalletEvent) {
    const previousState = this.currentStatus.state
    
    this.currentStatus = {
      ...this.currentStatus,
      state: newState,
      isLoading: this.isLoadingState(newState)
    }

    // Обновляем дополнительные поля на основе события
    if (event) {
      switch (event.type) {
        case 'CONNECTION_SUCCESS':
          if ('network' in event && 'account' in event) {
            this.currentStatus.network = event.network
            this.currentStatus.account = event.account
            this.currentStatus.error = undefined
          }
          break
          
        case 'CONNECTION_ERROR':
          if ('error' in event) {
            this.currentStatus.error = event.error
            this.currentStatus.network = undefined
            this.currentStatus.account = undefined
          }
          break
          
        case 'DISCONNECTED':
          this.currentStatus.network = undefined
          this.currentStatus.account = undefined
          this.currentStatus.error = undefined
          break
      }
    }

    console.log('✅ NetworkProvider: Состояние обновлено:', {
      previous: previousState,
      current: this.currentStatus.state,
      hasNetwork: !!this.currentStatus.network,
      hasAccount: !!this.currentStatus.account
    })

    // Уведомляем всех подписчиков
    this.statusCallbacks.forEach(callback => {
      try {
        callback({ ...this.currentStatus })
      } catch (error) {
        console.error('❌ NetworkProvider: Ошибка в callback:', error)
      }
    })
  }

  // Проверка является ли состояние загрузочным
  private isLoadingState(state: WalletState): boolean {
    return [
      WalletState.AccountInitialization,
      WalletState.NetworkSwitching
    ].includes(state)
  }

  // Обнаружение провайдера
  private detectProvider() {
    if (typeof window !== 'undefined' && window.ethereum) {
      wallet = window.ethereum as Eth;
      console.log('🔍 NetworkProvider: MetaMask обнаружен')
      
      const provider = new ethers.BrowserProvider(wallet)
      this.processEvent({ type: 'PROVIDER_DETECTED', provider })
      
      // Подписываемся на события MetaMask
      this.setupEventListeners()
    } else {
      console.log('❌ NetworkProvider: MetaMask не найден')
      this.updateStatus(WalletState.NoProvider)
    }
  }

  // Настройка слушателей событий MetaMask
  private setupEventListeners() {
    if (!wallet) return

    // Смена аккаунтов
    wallet.on('accountsChanged', (accounts: string[]) => {
      console.log('👤 NetworkProvider: Аккаунты изменились:', accounts)
      
      if (accounts.length === 0) {
        this.processEvent({ type: 'DISCONNECTED' })
      } else {
        this.processEvent({ type: 'ACCOUNT_CHANGED', account: accounts[0] })
        // После смены аккаунта сразу пытаемся переподключиться
        this.refresh()
      }
    })

    // Смена сети
    wallet.on('chainChanged', (chainIdHex: string) => {
      const chainId = BigInt(chainIdHex)
      console.log('🌐 NetworkProvider: Сеть изменилась:', chainId.toString())
      
      this.processEvent({ type: 'NETWORK_CHANGED', chainId })
      // После смены сети пытаемся переподключиться
      this.refresh()
    })

    // Отключение
    wallet.on('disconnect', () => {
      console.log('🔌 NetworkProvider: Отключение')
      this.processEvent({ type: 'DISCONNECTED' })
    })
  }

  // Основной метод подключения к кошельку
  async connect(): Promise<Network> {
    console.log('🚀 NetworkProvider: Запрос подключения...')
    
    this.processEvent({ type: 'CONNECT_REQUESTED' })
    
    try {
      // Обновляем wallet на случай если он стал доступен
      if (typeof window !== 'undefined' && window.ethereum) {
        wallet = window.ethereum as Eth;
      }
      
      if (!wallet) {
        throw new Error('MetaMask не установлен!')
      }

      // Создаем provider и получаем доступ к аккаунтам
      const provider = new ethers.BrowserProvider(wallet)
      
      // Запрашиваем доступ к аккаунтам
      await provider.send('eth_requestAccounts', [])
      
      // Получаем signer и информацию о сети
      const signer = await provider.getSigner()
      const network = await provider.getNetwork()
      const account = await signer.getAddress()
      
      console.log('✅ NetworkProvider: Подключение успешно:', {
        chainId: network.chainId.toString(),
        account
      })

      // Проверяем поддерживается ли сеть
      if (!this.supportedNetworks.has(network.chainId)) {
        throw new Error(`Сеть ${network.chainId} не поддерживается`)
      }

      // Создаем Network объект
      const networkInstance: Network = {
        id: network.chainId,
        provider: provider,
        signer,
        eip1193Provider: wallet  // Сохраняем оригинальный window.ethereum
      }

      this.processEvent({ 
        type: 'CONNECTION_SUCCESS', 
        network: networkInstance,
        account 
      })

      return networkInstance

    } catch (error: any) {
      console.error('❌ NetworkProvider: Ошибка подключения:', error)
      
      this.processEvent({ 
        type: 'CONNECTION_ERROR', 
        error: error.message || 'Ошибка подключения к кошельку'
      })
      
      throw error
    }
  }

  // Обновление текущего подключения (для переподключения)
  async refresh(): Promise<Network | null> {
    console.log('🔄 NetworkProvider: Обновление подключения...')
    
    try {
      // Обновляем wallet на случай если он изменился
      if (typeof window !== 'undefined' && window.ethereum) {
        wallet = window.ethereum as Eth;
      }
      
      if (!wallet) {
        this.processEvent({ type: 'DISCONNECTED' })
        return null
      }

      const provider: BrowserProvider = new ethers.BrowserProvider(wallet)
      
      // Проверяем есть ли подключенные аккаунты
      const accounts = await provider.listAccounts()
      if (accounts.length === 0) {
        this.processEvent({ type: 'DISCONNECTED' })
        return null
      }

      const signer = await provider.getSigner()
      const network = await provider.getNetwork()
      const account = await signer.getAddress()

      // Проверяем поддерживается ли сеть
      if (!this.supportedNetworks.has(network.chainId)) {
        this.processEvent({ 
          type: 'CONNECTION_ERROR',
          error: `Сеть ${network.chainId} не поддерживается` 
        })
        return null
      }

      const networkInstance: Network = {
        id: network.chainId,
        provider: provider,
        signer,
        eip1193Provider: wallet  // Сохраняем оригинальный window.ethereum
      }

      this.processEvent({ 
        type: 'CONNECTION_SUCCESS',
        network: networkInstance,
        account 
      })

      return networkInstance

    } catch (error: any) {
      console.error('❌ NetworkProvider: Ошибка обновления:', error)
      
      this.processEvent({ 
        type: 'CONNECTION_ERROR',
        error: error.message || 'Ошибка обновления подключения'
      })
      
      return null
    }
  }

  // Отключение от кошелька
  disconnect() {
    console.log('🔌 NetworkProvider: Отключение...')
    this.processEvent({ type: 'DISCONNECTED' })
  }

  // Проверка подключения
  isConnected(): boolean {
    return this.currentStatus.state === WalletState.Connected && 
           !!this.currentStatus.network
  }

  // Получить конфигурацию сети по ID
  getNetworkConfig(chainId: bigint): NetworkConfig | undefined {
    return this.supportedNetworks.get(chainId)
  }

  // Добавить поддерживаемую сеть
  addSupportedNetwork(config: NetworkConfig) {
    this.supportedNetworks.set(config.chainId, config)
  }

  // Получить список поддерживаемых сетей
  getSupportedNetworks(): NetworkConfig[] {
    return Array.from(this.supportedNetworks.values())
  }
}

// Singleton instance
export const networkProvider = new NetworkProvider()
