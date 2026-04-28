# Firebase Collections Schema

This document outlines the desired structures for the KOT System Firestore collections.
Note: Since Firestore is NoSQL, these collections won't be rigidly enforced but this structure must be used in the system logic.

## `/tables`
*   `tableId` (string)
*   `status` ("available" | "occupied")
*   `currentSessionId` (string | null)

## `/kots`
*   `kotId` *auto-generated document id*
*   `tableNumber` (number)
*   `items` (array of objects)
    *   `itemId` (string)
    *   `name` (string)
    *   `price` (number)
    *   `qty` (number)
    *   `imageUrl` (string)
    *   `status` ("pending" | "done")
*   `createdAt` (timestamp)
*   `kotStatus` ("open" | "cleared")

## `/bills`
*   `billId` *auto-generated document id*
*   `tableNumber` (number)
*   `kotIds` (array of strings)
*   `subtotal` (number)
*   `serviceCharge` (number)
*   `tax` (number)
*   `total` (number)
*   `createdAt` (timestamp)
*   `printed` (boolean)
