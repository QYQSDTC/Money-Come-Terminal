import React, { Component, type ErrorInfo, type ReactNode } from 'react'

interface ErrorBoundaryProps {
  children: ReactNode
}

interface ErrorBoundaryState {
  hasError: boolean
  error: Error | null
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    console.error('[ErrorBoundary] Uncaught error:', error)
    console.error('[ErrorBoundary] Component stack:', errorInfo.componentStack)
  }

  handleReload = (): void => {
    this.setState({ hasError: false, error: null })
    window.location.reload()
  }

  render(): ReactNode {
    if (this.state.hasError) {
      return (
        <div className="error-boundary">
          <div style={{ fontSize: 48, marginBottom: 16, opacity: 0.4 }}>⚠</div>
          <h2>应用出现异常</h2>
          <p>
            很抱歉，应用遇到了一个未预期的错误。
            这通常不会影响您的数据安全，点击下方按钮重新加载即可恢复。
          </p>
          <button onClick={this.handleReload}>重新加载</button>
          {this.state.error && (
            <pre>{this.state.error.message}</pre>
          )}
        </div>
      )
    }

    return this.props.children
  }
}
