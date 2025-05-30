# AgentKit SWE-bench

This is an example of a coding agent that uses the [SWE-bench](https://arxiv.org/abs/2310.06770) benchmark with AgentKit.

## Setup

Install all dependencies:

```shell
pnpm install
```

Create and set your [Anthropic API key](https://docs.anthropic.com/en/api/getting-started). Set it in your shell:

```shell
export ANTHROPIC_API_KEY="sk-ant-api03-JOs892nf..."
```

Start the server:

```shell
pnpm start
```

Start the Inngest Dev Server:

```shell
npx inngest-cli@latest dev -u http://localhost:3001/api/inngest
```

Open the Dev Server's UI at `http://localhost:8288`

## Running SWE-bench examples

You can download the full SWE-bench examples by running `make init` and reading the parquet file.

### Quick example

On the Dev Server's [functions](http://localhost:8288/functions) tab, click the "invoke" button and paste the following payload which is from the SWE-bench dataset.

````json
{
  "data": {
    "repo": "pvlib/pvlib-python",
    "instance_id": "pvlib__pvlib-python-1854",
    "base_commit": "27a3a07ebc84b11014d3753e4923902adf9a38c0",
    "patch": "diff --git a/pvlib/pvsystem.py b/pvlib/pvsystem.py\n--- a/pvlib/pvsystem.py\n+++ b/pvlib/pvsystem.py\n@@ -101,10 +101,11 @@ class PVSystem:\n \n     Parameters\n     ----------\n-    arrays : iterable of Array, optional\n-        List of arrays that are part of the system. If not specified\n-        a single array is created from the other parameters (e.g.\n-        `surface_tilt`, `surface_azimuth`). Must contain at least one Array,\n+    arrays : Array or iterable of Array, optional\n+        An Array or list of arrays that are part of the system. If not\n+        specified a single array is created from the other parameters (e.g.\n+        `surface_tilt`, `surface_azimuth`). If specified as a list, the list\n+        must contain at least one Array;\n         if length of arrays is 0 a ValueError is raised. If `arrays` is\n         specified the following PVSystem parameters are ignored:\n \n@@ -220,6 +221,8 @@ def __init__(self,\n                 strings_per_inverter,\n                 array_losses_parameters,\n             ),)\n+        elif isinstance(arrays, Array):\n+            self.arrays = (arrays,)\n         elif len(arrays) == 0:\n             raise ValueError(\"PVSystem must have at least one Array. \"\n                              \"If you want to create a PVSystem instance \"\n",
    "test_patch": "diff --git a/pvlib/tests/test_pvsystem.py b/pvlib/tests/test_pvsystem.py\n--- a/pvlib/tests/test_pvsystem.py\n+++ b/pvlib/tests/test_pvsystem.py\n@@ -1887,8 +1887,6 @@ def test_PVSystem_multiple_array_creation():\n     assert pv_system.arrays[0].module_parameters == {}\n     assert pv_system.arrays[1].module_parameters == {'pdc0': 1}\n     assert pv_system.arrays == (array_one, array_two)\n-    with pytest.raises(TypeError):\n-        pvsystem.PVSystem(arrays=array_one)\n \n \n def test_PVSystem_get_aoi():\n@@ -2362,6 +2360,14 @@ def test_PVSystem_at_least_one_array():\n         pvsystem.PVSystem(arrays=[])\n \n \n+def test_PVSystem_single_array():\n+    # GH 1831\n+    single_array = pvsystem.Array(pvsystem.FixedMount())\n+    system = pvsystem.PVSystem(arrays=single_array)\n+    assert isinstance(system.arrays, tuple)\n+    assert system.arrays[0] is single_array\n+\n+\n def test_combine_loss_factors():\n     test_index = pd.date_range(start='1990/01/01T12:00', periods=365, freq='D')\n     loss_1 = pd.Series(.10, index=test_index)\n",
    "problem_statement": "PVSystem with single Array generates an error\n**Is your feature request related to a problem? Please describe.**\r\n\r\nWhen a PVSystem has a single Array, you can't assign just the Array instance when constructing the PVSystem.\r\n\r\n```\r\nmount = pvlib.pvsystem.FixedMount(surface_tilt=35, surface_azimuth=180)\r\narray = pvlib.pvsystem.Array(mount=mount)\r\npv = pvlib.pvsystem.PVSystem(arrays=array)\r\n\r\n---------------------------------------------------------------------------\r\nTypeError                                 Traceback (most recent call last)\r\n<ipython-input-13-f5424e3db16a> in <module>\r\n      3 mount = pvlib.pvsystem.FixedMount(surface_tilt=35, surface_azimuth=180)\r\n      4 array = pvlib.pvsystem.Array(mount=mount)\r\n----> 5 pv = pvlib.pvsystem.PVSystem(arrays=array)\r\n\r\n~\\anaconda3\\lib\\site-packages\\pvlib\\pvsystem.py in __init__(self, arrays, surface_tilt, surface_azimuth, albedo, surface_type, module, module_type, module_parameters, temperature_model_parameters, modules_per_string, strings_per_inverter, inverter, inverter_parameters, racking_model, losses_parameters, name)\r\n    251                 array_losses_parameters,\r\n    252             ),)\r\n--> 253         elif len(arrays) == 0:\r\n    254             raise ValueError(\"PVSystem must have at least one Array. \"\r\n    255                              \"If you want to create a PVSystem instance \"\r\n\r\nTypeError: object of type 'Array' has no len()\r\n\r\n```\r\n\r\nNot a bug per se, since the PVSystem docstring requests that `arrays` be iterable. Still, a bit inconvenient to have to do this\r\n\r\n```\r\nmount = pvlib.pvsystem.FixedMount(surface_tilt=35, surface_azimuth=180)\r\narray = pvlib.pvsystem.Array(mount=mount)\r\npv = pvlib.pvsystem.PVSystem(arrays=[array])\r\n```\r\n\r\n**Describe the solution you'd like**\r\nHandle `arrays=array` where `array` is an instance of `Array`\r\n\r\n**Describe alternatives you've considered**\r\nStatus quo - either make the single Array into a list, or use the PVSystem kwargs.\r\n\n",
    "hints_text": "",
    "created_at": "2023-09-13T17:25:47Z",
    "version": "0.9",
    "environment_setup_commit": "6072e0982c3c0236f532ddfa48fbf461180d834e"
  }
}
```
````
