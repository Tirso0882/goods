"use client"

import { loadStripe } from "@stripe/stripe-js"
import React, { useMemo } from "react"
import StripeWrapper from "./stripe-wrapper"
import { HttpTypes } from "@medusajs/types"
import { isStripeLike } from "@lib/constants"

type PaymentWrapperProps = {
  cart: HttpTypes.StoreCart
  stripeKey: string | null
  stripeAccount: string | null
  children: React.ReactNode
}

const PaymentWrapper: React.FC<PaymentWrapperProps> = ({
  cart,
  stripeKey,
  stripeAccount,
  children,
}) => {
  const stripePromise = useMemo(
    () =>
      stripeKey
        ? loadStripe(stripeKey, stripeAccount ? { stripeAccount } : undefined)
        : null,
    [stripeKey, stripeAccount]
  )

  const paymentSession = cart.payment_collection?.payment_sessions?.find(
    (s) => s.status === "pending"
  )

  if (
    isStripeLike(paymentSession?.provider_id) &&
    paymentSession &&
    stripePromise
  ) {
    return (
      <StripeWrapper
        paymentSession={paymentSession}
        stripeKey={stripeKey ?? undefined}
        stripePromise={stripePromise}
      >
        {children}
      </StripeWrapper>
    )
  }

  return <div>{children}</div>
}

export default PaymentWrapper
