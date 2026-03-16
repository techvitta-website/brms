type StatementTransactionLike = {
  id?: string;
  transaction_date?: string | null;
  value_date?: string | null;
  description?: string | null;
  debit_amount?: number | null;
  credit_amount?: number | null;
  transaction_type?: string | null;
  metadata?: any;
};

const normalizeText = (value: unknown) =>
  String(value ?? "")
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();

const normalizeAmount = (value: number | null | undefined) => Number(value || 0).toFixed(2);

export const getTransactionDateFromMetadataOriginal = (metadata: any): string | null => {
  if (!metadata) return null;

  if (metadata.original_data?.["Transaction Date"]) {
    return metadata.original_data["Transaction Date"];
  }

  if (Array.isArray(metadata.all_columns)) {
    const transactionDateColumn = metadata.all_columns.find(
      (col: any) => col?.header && String(col.header).toLowerCase().includes("transaction date")
    );
    if (transactionDateColumn?.value) {
      return transactionDateColumn.value;
    }
  }

  return null;
};

export const getValueDateFromMetadataOriginal = (metadata: any): string | null => {
  if (!metadata) return null;

  if (metadata.original_data?.["Value Date"]) {
    return metadata.original_data["Value Date"];
  }

  if (Array.isArray(metadata.all_columns)) {
    const valueDateColumn = metadata.all_columns.find(
      (col: any) => col?.header && String(col.header).toLowerCase().includes("value date")
    );
    if (valueDateColumn?.value) {
      return valueDateColumn.value;
    }
  }

  return null;
};

export const getStatementTransactionDedupeKey = (transaction: StatementTransactionLike) => {
  const metadataTransactionDate = getTransactionDateFromMetadataOriginal(transaction.metadata);
  const metadataValueDate = getValueDateFromMetadataOriginal(transaction.metadata);

  return [
    normalizeText(metadataTransactionDate || transaction.transaction_date || ""),
    normalizeText(metadataValueDate || transaction.value_date || ""),
    normalizeText(transaction.description || ""),
    normalizeAmount(transaction.debit_amount),
    normalizeAmount(transaction.credit_amount),
    normalizeText(transaction.transaction_type || ""),
  ].join("|");
};

export const dedupeStatementTransactions = <T extends StatementTransactionLike>(transactions: T[]) => {
  const uniqueTransactions = new Map<string, T>();

  transactions.forEach((transaction) => {
    const key = getStatementTransactionDedupeKey(transaction);
    if (!uniqueTransactions.has(key)) {
      uniqueTransactions.set(key, transaction);
    }
  });

  return Array.from(uniqueTransactions.values());
};
