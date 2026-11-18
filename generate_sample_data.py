import pandas as pd
import os

# Sample training data
data = [
    {
        "docstring": "Add two numbers together",
        "code": "def add(a, b):\n    return a + b"
    },
    {
        "docstring": "Subtract b from a",
        "code": "def subtract(a, b):\n    return a - b"
    },
    {
        "docstring": "Multiply two numbers",
        "code": "def multiply(a, b):\n    return a * b"
    },
    {
        "docstring": "Divide a by b",
        "code": "def divide(a, b):\n    if b == 0:\n        raise ValueError('Cannot divide by zero')\n    return a / b"
    },
    {
        "docstring": "Check if a number is even",
        "code": "def is_even(num):\n    return num % 2 == 0"
    },
    {
        "docstring": "Check if a number is odd",
        "code": "def is_odd(num):\n    return num % 2 != 0"
    },
    {
        "docstring": "Calculate factorial of a number",
        "code": "def factorial(n):\n    if n < 0:\n        raise ValueError('Factorial is not defined for negative numbers')\n    if n == 0:\n        return 1\n    return n * factorial(n - 1)"
    },
    {
        "docstring": "Check if a string is a palindrome",
        "code": "def is_palindrome(s):\n    s = ''.join(c.lower() for c in s if c.isalnum())\n    return s == s[::-1]"
    }
]

def generate_sample_data():
    # Create a DataFrame
    df = pd.DataFrame(data)
    
    # Create data directory if it doesn't exist
    os.makedirs('data', exist_ok=True)
    
    # Save as parquet
    output_file = 'data/sample_data.parquet'
    df.to_parquet(output_file, index=False)
    print(f"Sample data generated and saved to {output_file}")
    print(f"Total examples: {len(df)}")

if __name__ == "__main__":
    generate_sample_data()
